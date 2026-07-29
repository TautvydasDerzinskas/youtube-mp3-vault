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

// Folds away diacritics and punctuation on top of normalizeForMatch's
// case/whitespace normalization — lets "Café" match "Cafe" and "Don't Stop"
// match "Dont Stop" (common transliteration/typing differences between how a
// track is tagged locally vs. by whichever peer uploaded it) without opening
// the door to genuinely different titles.
function foldForMatch(s: string): string {
  return normalizeForMatch(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(s: string): Set<string> {
  return new Set(foldForMatch(s).split(' ').filter(Boolean));
}

// Jaccard similarity over word sets — tolerant of reordering, a dropped/added
// filler word ("The", "feat"), or minor spelling variation, without being so
// loose that two titles sharing only a couple of common words would pass.
function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// One side containing the other (after folding) tolerates a candidate
// filename carrying extra featured-artist credits ("Artist ft. Other") that
// our own stored artist doesn't, or vice versa, without accepting an
// unrelated artist that merely shares a short substring.
function artistIsSupersetMatch(a: string, b: string): boolean {
  const fa = foldForMatch(a);
  const fb = foldForMatch(b);
  if (!fa || !fb) return false;
  return fa === fb || fa.includes(fb) || fb.includes(fa);
}

const FUZZY_TITLE_SIMILARITY_THRESHOLD = 0.82;

// How close a candidate's reported length has to be to our stored video
// duration to corroborate a match, in seconds. YouTube video duration can
// legitimately diverge a bit from a track's canonical length (intros,
// trimmed uploads, extended edits), so this is a proximity window, not
// equality — and it's deliberately narrower the looser a tier's text
// comparison already is: an exact artist+title match barely needs duration
// to confirm anything (it's a sanity backstop against, say, a same-titled
// but different recording), whereas the fuzzy-title tier leans on duration
// as real corroborating evidence, not just a backstop.
function durationToleranceSeconds(videoDurationSec: number, strictness: 'sanity' | 'moderate' | 'tight'): number {
  switch (strictness) {
    case 'sanity': return Math.max(20, videoDurationSec * 0.15);
    case 'moderate': return Math.max(12, videoDurationSec * 0.10);
    case 'tight': return Math.max(8, videoDurationSec * 0.07);
  }
}

// requireKnown=false treats "one or both durations unknown" as non-disqualifying
// (many Soulseek peers don't report file length, and our own video.duration can
// be null for older rows) — only the fuzzy-title tier, which needs duration to
// carry real weight rather than just sanity-check an already-confident match,
// requires both sides to actually be known.
function isDurationPlausible(
  candidateSec: number | null,
  videoDurationSec: number | null,
  strictness: 'sanity' | 'moderate' | 'tight',
  requireKnown: boolean,
): boolean {
  if (candidateSec === null || videoDurationSec === null) return !requireKnown;
  return Math.abs(candidateSec - videoDurationSec) <= durationToleranceSeconds(videoDurationSec, strictness);
}

// Soulseek filenames often carry a full path from the peer's own filesystem
// (Windows-style, sometimes forward slashes) — take just the last segment
// and strip the extension before parsing it as "Artist - Title".
function baseNameFromSlskdPath(filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  return lastSegment.replace(/\.[a-z0-9]{2,4}$/i, '');
}

interface MatchTier {
  textMatch: (parsedArtist: string, parsedTitle: string, artist: string, title: string) => boolean;
  durationStrictness: 'sanity' | 'moderate' | 'tight';
  requireKnownDuration: boolean;
  // Minimum bitrate improvement (beyond just "any improvement") required for
  // a candidate at this tier — the looser the text match, the more the
  // eventual replacement needs to be worth the small residual risk of it
  // being a slightly different recording of the same song.
  minBitrateImprovementKbps: number;
}

// Tried in order — the first tier to produce any surviving candidate wins,
// looser tiers are never even evaluated. Deliberately kept as separate
// sequential passes rather than one flattened scoring function, so each
// tier's own bar (text confidence + matching duration tolerance + minimum
// bitrate margin) stays easy to reason about independently.
const MATCH_TIERS: MatchTier[] = [
  {
    // Exact, case/whitespace-insensitive artist+title match — deliberately
    // not stripped of remix/version/edit wording (parseArtistAndTitle
    // already treats that as real track information, not junk), so a
    // different mix of the same song never passes as a match.
    textMatch: (pa, pt, a, t) => normalizeForMatch(pa) === normalizeForMatch(a) && normalizeForMatch(pt) === normalizeForMatch(t),
    durationStrictness: 'sanity',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 0,
  },
  {
    // Same, but diacritic/punctuation-folded — catches "Café" vs "Cafe",
    // "Don't" vs "Dont", smart quotes vs straight quotes, etc.
    textMatch: (pa, pt, a, t) => foldForMatch(pa) === foldForMatch(a) && foldForMatch(pt) === foldForMatch(t),
    durationStrictness: 'sanity',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 0,
  },
  {
    // Title still has to match exactly (folded); artist is now allowed to be
    // a superset/subset of ours, tolerating extra featured-artist credits on
    // either side.
    textMatch: (pa, pt, a, t) => artistIsSupersetMatch(pa, a) && foldForMatch(pt) === foldForMatch(t),
    durationStrictness: 'moderate',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 32,
  },
  {
    // Loosest tier: fuzzy token-overlap title similarity plus artist
    // superset tolerance. This is the only tier where duration is required
    // (not just checked when available), since text confidence alone isn't
    // enough to trust an automatic file replacement here.
    textMatch: (pa, pt, a, t) => artistIsSupersetMatch(pa, a) && titleSimilarity(pt, t) >= FUZZY_TITLE_SIMILARITY_THRESHOLD,
    durationStrictness: 'tight',
    requireKnownDuration: true,
    minBitrateImprovementKbps: 32,
  },
];

export interface HqCandidate {
  username: string;
  filename: string;
  size: number;
  bitrate: number;
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
        if (!filename.toLowerCase().endsWith('.mp3')) continue;
        const bitrate = Number(file?.bitRate ?? 0);
        if (!Number.isFinite(bitrate) || bitrate <= 0 || bitrate > MAX_PLAUSIBLE_MP3_BITRATE_KBPS) continue;
        if (currentBitrate !== null && bitrate <= currentBitrate + tier.minBitrateImprovementKbps) continue;
        if (best && bitrate <= best.bitrate) continue;

        const parsed = parseArtistAndTitle(baseNameFromSlskdPath(filename), null);
        if (!parsed.artist) continue;
        if (!tier.textMatch(parsed.artist, parsed.title, artist, title)) continue;

        const candidateDurationSec = typeof file?.length === 'number' ? file.length : null;
        if (!isDurationPlausible(candidateDurationSec, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

        best = { username: response.username, filename, size: file.size, bitrate };
      }
    }
    if (best) return best;
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
