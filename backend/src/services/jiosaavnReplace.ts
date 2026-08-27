import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { stat, unlink } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { join, extname } from 'path';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { searchJioSaavnTrack, type JioSaavnLink } from './jiosaavn';
import { MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { MATCH_TIERS, isDurationPlausible, type MatchTier } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';

// Fallback HQ source, tried only after slskd's own search (see hqReplace.ts)
// turns up nothing — JioSaavn is a free public catalog with no peer pool to
// wait on, so a match here is available immediately rather than depending on
// who happens to be online, but it's also a different (Indian-market-skewed)
// catalog, so plenty of tracks it simply won't have.
const JIOSAAVN_SEARCH_LIMIT = 10;

// Generous ceiling for downloading one track's media file directly from
// JioSaavn's CDN — same rationale as every other per-track network timeout
// in this app (see slskd.ts/downloader.ts): a stalled transfer shouldn't
// hang the calling sync pass forever.
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;

function parseQualityKbps(quality: string): number {
  const match = /(\d+)/.exec(quality);
  return match ? Number(match[1]) : 0;
}

// Highest-bitrate media link JioSaavn offered, capped at the same ceiling
// used everywhere else in this app as "the highest plausible real mp3
// bitrate" — JioSaavn's own encode is AAC, not mp3, but the label is treated
// the same way any other source's reported bitrate is: a plausible quality
// signal, made moot anyway once downloadAndReplace transcodes it to mp3.
function pickBestMediaLink(media: JioSaavnLink[]): { link: JioSaavnLink; bitrate: number } | null {
  let best: { link: JioSaavnLink; bitrate: number } | null = null;
  for (const link of media) {
    const bitrate = parseQualityKbps(link.quality);
    if (bitrate <= 0 || bitrate > MAX_PLAUSIBLE_MP3_BITRATE_KBPS) continue;
    if (!best || bitrate > best.bitrate) best = { link, bitrate };
  }
  return best;
}

export interface JioSaavnHqCandidate {
  id: string;
  title: string;
  artist: string;
  mediaUrl: string;
  bitrate: number;
}

// Searches JioSaavn for this track and returns the best-bitrate match that
// beats currentBitrate, per the same tiered artist/title/duration confidence
// bar slskd's findExactMatchCandidate uses (see trackMatching.ts) — JioSaavn
// already hands back separated artist/title fields, so unlike slskd there's
// no filename to parse first.
export async function findJioSaavnCandidate(
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
  // Overridable so the rename-triggered HQ search can pass
  // MATCH_TIERS_TRUSTED_NAME instead — see that constant's own doc comment.
  tiers: MatchTier[] = MATCH_TIERS,
): Promise<JioSaavnHqCandidate | null> {
  if (!isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;

  const tracks = await searchJioSaavnTrack(artist, title, JIOSAAVN_SEARCH_LIMIT);
  if (tracks.length === 0) return null;

  for (const tier of tiers) {
    let best: { track: (typeof tracks)[number]; media: JioSaavnLink; bitrate: number } | null = null;

    for (const track of tracks) {
      if (!tier.textMatch(track.artist, track.title, artist, title)) continue;
      if (!isDurationPlausible(track.duration, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

      const media = pickBestMediaLink(track.media);
      if (!media) continue;
      if (currentBitrate !== null && media.bitrate <= currentBitrate + tier.minBitrateImprovementKbps) continue;
      if (best && media.bitrate <= best.bitrate) continue;

      best = { track, media: media.link, bitrate: media.bitrate };
    }

    if (best) {
      console.log(`[jiosaavn] Found: "${artist} - ${title}" -> "${best.track.artist} - ${best.track.title}" (${best.bitrate}kbps)`);
      return { id: best.track.id, title: best.track.title, artist: best.track.artist, mediaUrl: best.media.url, bitrate: best.bitrate };
    }
  }

  return null;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`JioSaavn media download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
}

// Downloads a matched candidate from JioSaavn and replaces the shared mp3
// for `video` in place, same contract as hqReplace.ts's downloadAndReplace
// (every PlaylistVideo row sharing the mediaFileId benefits; returns false
// without throwing on any failure, meaning "try again next sync"). JioSaavn
// serves AAC in an mp4 container (occasionally something else) rather than
// mp3 — this app's library is mp3-only throughout, so the download is always
// transcoded regardless of what the source claims, never trusted/renamed
// as-is the way an already-mp3 slskd file is.
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  candidate: JioSaavnHqCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  // Publishes back to the file's *current* name — see hqReplace.ts's
  // downloadAndReplace for why this can't just reconstruct `${youtubeId}.mp3`.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: video.mediaFileId }, select: { filename: true } });
  if (!mediaFile) return false;

  console.log(`[jiosaavn] Download started: ${video.youtubeId} ("${candidate.artist} - ${candidate.title}")`);

  const tmpDir = getTmpDir();
  const attemptId = `${video.youtubeId}-${randomUUID()}`;
  const rawExt = extname(new URL(candidate.mediaUrl).pathname) || '.media';
  const tmpRawPath = join(tmpDir, `${attemptId}${rawExt}`);
  const tmpMp3Path = join(tmpDir, `${attemptId}.mp3`);

  // Wraps the whole attempt (not just the download) so a late failure —
  // ffmpeg missing/misbehaving, a disk-full rename, a DB hiccup — can never
  // escape as an uncaught rejection and always still cleans up whatever tmp
  // files this attempt created, same "never throws, always tidy" contract
  // hqReplace.ts's slskd version has for its own tmp files.
  try {
    await ensureSharedDirs();
    await downloadToFile(candidate.mediaUrl, tmpRawPath);

    const transcoded = await transcodeToMp3(tmpRawPath, tmpMp3Path);
    await unlink(tmpRawPath).catch(() => {});
    if (!transcoded) {
      await unlink(tmpMp3Path).catch(() => {});
      return false;
    }

    const tmpStats = await stat(tmpMp3Path);
    await publishToSharedStore(tmpMp3Path, mediaFile.filename);

    // hqFileDownloaded is this app's "stop looking, we're done" signal (see
    // slskdQualityWorker.ts's rescanAll query, which only ever re-checks
    // videos where this is still false) — only true once the matched
    // candidate actually reached the real ceiling. JioSaavn offers a range
    // of qualities (96/160/320kbps AAC), and findJioSaavnCandidate can
    // return a below-320 match once it clears a tier's improvement margin —
    // that's still worth taking, but the file gets published and left
    // flagged as betterQualityExists so a future rescan keeps trying other
    // sources for the real 320 instead of considering this one settled.
    const reachedCeiling = candidate.bitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS;

    await prisma.mediaFile.update({
      where: { id: video.mediaFileId },
      data: { fileSize: tmpStats.size, bitrate: candidate.bitrate },
    });
    await prisma.playlistVideo.updateMany({
      where: { mediaFileId: video.mediaFileId },
      data: {
        hqFileDownloaded: reachedCeiling,
        betterQualityExists: !reachedCeiling,
        bitrate: candidate.bitrate,
        fileSize: tmpStats.size,
        qualityCheckStatus: 'checked',
        qualityCheckedAt: new Date(),
      },
    });

    console.log(`[jiosaavn] Download completed: ${video.youtubeId} (${tmpStats.size} bytes)`);
    return true;
  } catch (err) {
    console.error(`[jiosaavn] HQ download/replace failed for ${video.youtubeId}:`, (err as Error).message);
    // Best-effort — by this point either file may or may not exist
    // depending on exactly where the failure happened (unlinking a path
    // that's already gone, e.g. because publishToSharedStore already moved
    // it, is a harmless no-op).
    await unlink(tmpRawPath).catch(() => {});
    await unlink(tmpMp3Path).catch(() => {});
    return false;
  }
}
