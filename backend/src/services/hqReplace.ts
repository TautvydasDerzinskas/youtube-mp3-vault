import { join } from 'path';
import { randomUUID } from 'crypto';
import { readdir, stat, unlink } from 'fs/promises';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { config } from '../config';
import { slskdClient, isSlskdConfigured, MAX_PLAUSIBLE_MP3_BITRATE_KBPS, LOSSLESS_EXTENSIONS } from './slskd';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';
import { isDurationPlausible, MATCH_TIERS, splitArtistTitle, stripUploadNoise } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';

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

// Soulseek filenames often carry a full path from the peer's own filesystem
// (Windows-style, sometimes forward slashes) — take just the last segment
// and strip the extension before parsing it as "Artist - Title".
function baseNameFromSlskdPath(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  return lastSegment.replace(/\.[a-z0-9]{2,4}$/i, '');
}

export interface HqCandidate {
  username: string;
  filename: string;
  size: number;
  bitrate: number;
  // 'lossless' candidates (flac/wav) carry no meaningful peer-reported
  // bitrate to compare — `bitrate` on those is the effective ceiling they'll
  // land at once downloadAndReplace transcodes them down to mp3.
  format: 'mp3' | 'lossless';
}

function audioFormatOf(filename: string): 'mp3' | 'lossless' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp3')) return 'mp3';
  if (LOSSLESS_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'lossless';
  return null;
}

// Lossless always outranks mp3 (it's a strict quality win once transcoded);
// among two lossless files, file size is the only quality proxy available
// without actually probing them (a 24-bit/96kHz flac is bigger than a
// 16-bit/44.1kHz one for the same track); among two mp3s, higher bitrate wins.
function isBetterCandidate(a: HqCandidate, b: HqCandidate): boolean {
  if (a.format !== b.format) return a.format === 'lossless';
  if (a.format === 'lossless') return a.size > b.size;
  return a.bitrate > b.bitrate;
}

// Searches our slskd instance for this track and returns the best mp3
// candidate that beats currentBitrate and matches per MATCH_TIERS above,
// trying the strictest tier first and only falling through to a looser one
// if nothing at all qualified. Returns null if slskd isn't configured, we're
// offline, or nothing eligible turned up at any tier — callers should treat
// that the same as "no upgrade found".
export async function findExactMatchCandidate(
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
): Promise<HqCandidate | null> {
  if (!isOnline() || !isSlskdConfigured()) return null;

  const searchText = `${artist} ${title}`.trim();
  if (!searchText) return null;

  const result = await slskdClient.search(searchText);
  if (!result) return null;

  for (const tier of MATCH_TIERS) {
    let best: HqCandidate | null = null;
    for (const response of result.responses) {
      for (const file of response.files ?? []) {
        const filename = file?.filename ?? '';
        const format = audioFormatOf(filename);
        if (!format) continue;

        let bitrate: number;
        if (format === 'mp3') {
          bitrate = Number(file?.bitRate ?? 0);
          if (!Number.isFinite(bitrate) || bitrate <= 0 || bitrate > MAX_PLAUSIBLE_MP3_BITRATE_KBPS) continue;
          if (currentBitrate !== null && bitrate <= currentBitrate + tier.minBitrateImprovementKbps) continue;
        } else {
          // Lossless is a strict win regardless of currentBitrate or the
          // tier's mp3-vs-mp3 improvement margin — the confidence gate here
          // is the text/duration match below, same as for mp3.
          bitrate = MAX_PLAUSIBLE_MP3_BITRATE_KBPS;
        }

        const candidate: HqCandidate = { username: response.username, filename, size: Number(file?.size ?? 0), bitrate, format };
        if (best && !isBetterCandidate(candidate, best)) continue;

        const parsed = splitArtistTitle(stripUploadNoise(baseNameFromSlskdPath(filename)));
        if (!parsed.artist) continue;
        if (!tier.textMatch(parsed.artist, parsed.title, artist, title)) continue;

        const candidateDurationSec = typeof file?.length === 'number' ? file.length : null;
        if (!isDurationPlausible(candidateDurationSec, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

        best = candidate;
      }
    }
    if (best) {
      console.log(`[slskd] Found: "${artist} - ${title}" -> "${best.filename}" from ${best.username}`);
      return best;
    }
  }
  return null;
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

  // Publishes back to the file's *current* name (not a reconstructed
  // `${youtubeId}.mp3`) — the shared file may already carry a clean
  // "Artist - Title.mp3" name from metadataWorker.ts's rename step, and
  // resetting it here would orphan that name and leave a stray duplicate.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: video.mediaFileId }, select: { filename: true } });
  if (!mediaFile) return false;

  console.log(`[slskd] Download started: ${video.youtubeId} ("${candidate.filename}" from ${candidate.username})`);

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

  let publishedSize: number;
  let publishedBitrate: number;

  if (candidate.format === 'lossless') {
    // This app's library is mp3-only throughout — a lossless peer file gets
    // transcoded down to a 320kbps mp3 before publishing, and the lossless
    // source is dropped afterward rather than kept around alongside it.
    await ensureSharedDirs();
    const tmpMp3Path = join(getTmpDir(), `${video.youtubeId}-${randomUUID()}.mp3`);
    const transcoded = await transcodeToMp3(foundPath, tmpMp3Path);
    if (!transcoded) {
      await unlink(tmpMp3Path).catch(() => {});
      return false;
    }
    const tmpStats = await stat(tmpMp3Path);
    await publishToSharedStore(tmpMp3Path, mediaFile.filename);
    await unlink(foundPath).catch(() => {});
    publishedSize = tmpStats.size;
    publishedBitrate = MAX_PLAUSIBLE_MP3_BITRATE_KBPS;
  } else {
    const fileStats = await stat(foundPath);
    await publishToSharedStore(foundPath, mediaFile.filename);
    publishedSize = fileStats.size;
    publishedBitrate = candidate.bitrate;
  }

  // hqFileDownloaded is this app's "stop looking, we're done" signal (see
  // slskdQualityWorker.ts's rescanAll query, which only ever re-checks
  // videos where this is still false) — only true once the published file
  // actually reached the real ceiling. An mp3 peer file can clear a tier's
  // improvement margin without reaching 320 (see isBetterCandidate/
  // findExactMatchCandidate above) — that's still worth taking, but stays
  // flagged as betterQualityExists so a future rescan keeps trying other
  // sources for the real 320 instead of considering this one settled.
  const reachedCeiling = publishedBitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS;

  await prisma.mediaFile.update({
    where: { id: video.mediaFileId },
    data: { fileSize: publishedSize, bitrate: publishedBitrate },
  });
  await prisma.playlistVideo.updateMany({
    where: { mediaFileId: video.mediaFileId },
    data: {
      hqFileDownloaded: reachedCeiling,
      betterQualityExists: !reachedCeiling,
      bitrate: publishedBitrate,
      fileSize: publishedSize,
      qualityCheckStatus: 'checked',
      qualityCheckedAt: new Date(),
    },
  });

  console.log(`[slskd] Download completed: ${video.youtubeId} (${publishedSize} bytes, ${publishedBitrate}kbps)`);
  return true;
}
