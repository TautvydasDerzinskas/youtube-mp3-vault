import { join } from 'path';
import { readdir, stat } from 'fs/promises';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { config } from '../config';
import { slskdClient, isSlskdConfigured, MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { parseArtistAndTitle } from './musicbrainz';
import { publishToSharedStore } from './downloader';

// Generous ceiling for a single track transfer, polled every couple of
// seconds — with a modified slskd whose "peers" are really the operator's
// own agents, this should resolve in seconds in practice, not minutes, but a
// queued/slow one shouldn't hang the calling sync pass indefinitely.
const DOWNLOAD_MAX_WAIT_MS = 5 * 60_000;
const DOWNLOAD_POLL_INTERVAL_MS = 2_000;

// slskd moves a completed download from its incomplete directory to its
// downloads directory shortly *after* the transfer's API state already
// reports Completed/Succeeded — this is how long we keep re-scanning the
// shared downloads volume for the file to actually show up before giving up.
const FILE_SETTLE_MAX_ATTEMPTS = 15;
const FILE_SETTLE_POLL_INTERVAL_MS = 1_000;

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Soulseek filenames often carry a full path from the peer's own filesystem
// (Windows-style, sometimes forward slashes) — take just the last segment
// and strip the extension before parsing it as "Artist - Title".
function baseNameFromSlskdPath(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  return lastSegment.replace(/\.[a-z0-9]{2,4}$/i, '');
}

// Stricter than the free path's "plausible" match: this is about to trigger
// an automatic download that REPLACES the local file, so the candidate's own
// filename must parse into the *exact* same artist and title we already have
// (case/whitespace aside) — deliberately not stripped of remix/version/edit
// wording (parseArtistAndTitle already treats that as real track information,
// not junk), so a different mix of the same song never passes as a match.
export function isExactTrackMatch(candidateFilename: string, artist: string, title: string): boolean {
  const parsed = parseArtistAndTitle(baseNameFromSlskdPath(candidateFilename), null);
  if (!parsed.artist) return false;
  return normalizeForMatch(parsed.artist) === normalizeForMatch(artist)
    && normalizeForMatch(parsed.title) === normalizeForMatch(title);
}

export interface HqCandidate {
  username: string;
  filename: string;
  size: number;
  bitrate: number;
}

// Searches our slskd instance for this track and returns the best mp3
// candidate that both beats currentBitrate and is an exact artist+title
// match. Returns null if slskd isn't configured, we're offline, or nothing
// eligible turned up — callers should treat that the same as "no upgrade found".
export async function findExactMatchCandidate(
  artist: string,
  title: string,
  currentBitrate: number | null,
): Promise<HqCandidate | null> {
  if (!isOnline() || !isSlskdConfigured()) return null;

  const searchText = `${artist} ${title}`.trim();
  if (!searchText) return null;

  const result = await slskdClient.search(searchText);
  if (!result) return null;

  let best: HqCandidate | null = null;
  for (const response of result.responses) {
    for (const file of response.files ?? []) {
      const filename = file?.filename ?? '';
      if (!filename.toLowerCase().endsWith('.mp3')) continue;
      const bitrate = Number(file?.bitRate ?? 0);
      if (!Number.isFinite(bitrate) || bitrate <= 0 || bitrate > MAX_PLAUSIBLE_MP3_BITRATE_KBPS) continue;
      if (currentBitrate !== null && bitrate <= currentBitrate) continue;
      if (best && bitrate <= best.bitrate) continue;
      if (!isExactTrackMatch(filename, artist, title)) continue;
      best = { username: response.username, filename, size: file.size, bitrate };
    }
  }
  return best;
}

function findMatchingTransfer(downloads: any[], filename: string): any {
  return downloads.find((d) => d?.filename === filename);
}

// slskd's TransferStates is a Soulseek.NET flags enum serialized as a
// comma-joined string (e.g. "Completed, Succeeded" / "Completed, Errored") —
// endedAt being set is the unambiguous "this transfer is finished, one way
// or another" signal; the state string is only consulted to tell success
// from failure once that's true.
function isTransferSuccessful(transfer: any): boolean {
  const state: string = transfer?.state ?? '';
  if (/errored|cancelled|rejected|timedout/i.test(state)) return false;
  return transfer?.size > 0 && transfer?.bytesTransferred === transfer?.size;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// slskd has no HTTP endpoint that hands back a completed download's bytes —
// it just moves the finished file into its own configured downloads
// directory on disk (verified against slskd's own source: DownloadService
// derives a destination under Directories.Downloads and moves the file
// there once the transfer succeeds). That directory is the same music_data
// docker volume this backend already mounts (see docker-compose.yml's
// SLSKD_DOWNLOADS_DIR=/data/downloads alongside MUSIC_DIR=/data) — so
// instead of an HTTP transfer, this just walks that shared directory
// looking for a file whose size matches exactly (the strongest available
// signal, per the exact byte count we already know from the search result)
// and whose name loosely matches, tolerating a brief delay for slskd's own
// incomplete-to-downloads move to actually finish on disk.
function getSlskdDownloadsDir(): string {
  return join(config.musicDir, 'downloads');
}

async function findFileByNameAndSize(dir: string, expectedBasename: string, expectedSize: number): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null; // directory may not exist (yet) — not an error worth surfacing
  }

  const normalizedExpected = expectedBasename.replace(/[^a-z0-9]/gi, '').toLowerCase();
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFileByNameAndSize(full, expectedBasename, expectedSize);
      if (nested) return nested;
      continue;
    }
    if (!entry.isFile()) continue;
    const normalizedActual = entry.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (!normalizedActual.includes(normalizedExpected) && !normalizedExpected.includes(normalizedActual)) continue;
    try {
      const s = await stat(full);
      if (s.size === expectedSize) return full;
    } catch {
      // race with slskd still writing this exact file — try the next candidate
    }
  }
  return null;
}

async function locateDownloadedFile(candidate: HqCandidate): Promise<string | null> {
  const expectedBasename = baseNameFromSlskdPath(candidate.filename);
  const root = getSlskdDownloadsDir();
  for (let attempt = 0; attempt < FILE_SETTLE_MAX_ATTEMPTS; attempt++) {
    const found = await findFileByNameAndSize(root, expectedBasename, candidate.size);
    if (found) return found;
    await sleep(FILE_SETTLE_POLL_INTERVAL_MS);
  }
  return null;
}

// Downloads a matched candidate via slskd and, once complete, replaces the
// shared mp3 for `video` in place — every PlaylistVideo row sharing the same
// mediaFileId benefits, since the file is deduplicated across
// playlists/users by youtubeId (see MediaFile in schema.prisma). Returns
// false (without throwing) on any failure along the way — the caller treats
// that as "try again next sync", not a permanent verdict.
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  candidate: HqCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  const enqueued = await slskdClient.enqueueDownload(
    candidate.username,
    [{ filename: candidate.filename, size: candidate.size }],
  );
  if (!enqueued) return false;

  const deadline = Date.now() + DOWNLOAD_MAX_WAIT_MS;
  let transfer: any = null;
  while (Date.now() < deadline) {
    await sleep(DOWNLOAD_POLL_INTERVAL_MS);
    const downloads = await slskdClient.getUserDownloads(candidate.username);
    transfer = findMatchingTransfer(downloads, candidate.filename);
    if (transfer?.endedAt) break;
  }
  if (!transfer?.endedAt || !isTransferSuccessful(transfer)) return false;

  const foundPath = await locateDownloadedFile(candidate);
  if (!foundPath) return false;

  const fileStats = await stat(foundPath);
  await publishToSharedStore(foundPath, `${video.youtubeId}.mp3`);

  await prisma.mediaFile.update({
    where: { id: video.mediaFileId },
    data: { fileSize: fileStats.size, bitrate: candidate.bitrate },
  });
  await prisma.playlistVideo.updateMany({
    where: { mediaFileId: video.mediaFileId },
    data: {
      hqFileDownloaded: true,
      betterQualityExists: false,
      bitrate: candidate.bitrate,
      fileSize: fileStats.size,
      qualityCheckStatus: 'checked',
      qualityCheckedAt: new Date(),
    },
  });

  return true;
}
