import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { stat, unlink } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import {
  searchBandcampTracks,
  getBandcampTrackDetails,
  getBandcampFreeDownloadUrl,
  BANDCAMP_STREAM_BITRATE_KBPS,
} from './bandcamp';
import { MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { MATCH_TIERS, isDurationPlausible } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';

// Fallback HQ source, tried alongside JioSaavn after slskd's own search (see
// hqReplace.ts/jiosaavnReplace.ts) turns up nothing — like JioSaavn, a free
// public catalog with no peer pool to wait on, but a very different one:
// plenty of independent/underground electronic, noise, and DIY-scene tracks
// exist on Bandcamp and nowhere else these providers look. Most matches here
// still top out at BANDCAMP_STREAM_BITRATE_KBPS (Bandcamp's own free preview
// stream, not a purchased/downloaded copy, see bandcamp.ts's module
// comment), but a track the artist has separately marked "Free Download"
// can go as high as MAX_PLAUSIBLE_MP3_BITRATE_KBPS via
// getBandcampFreeDownloadUrl — findBandcampCandidate below tries that path
// per match before falling back to the fixed preview stream.
const BANDCAMP_SEARCH_LIMIT = 10;

// Generous ceiling for downloading one track's media file directly from
// Bandcamp's CDN — same rationale as every other per-track network timeout
// in this app (see jiosaavnReplace.ts/deezer.ts).
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;

export interface BandcampHqCandidate {
  title: string;
  artist: string;
  streamUrl: string;
  // What this candidate will actually deliver: BANDCAMP_STREAM_BITRATE_KBPS
  // for the ordinary preview-stream fallback, or MAX_PLAUSIBLE_MP3_BITRATE_KBPS
  // when a Free Download resolved. Threaded through to downloadAndReplace so
  // the DB records what was really downloaded rather than assuming the best
  // case, the same honest-bitrate convention hqReplace.ts's non-lossless
  // branch uses.
  bitrate: number;
}

// Searches Bandcamp for this track and returns the first exact-enough match,
// per the same tiered artist/title/duration confidence bar every other
// provider in this app uses (see trackMatching.ts). Bandcamp's own search
// endpoint hands back only a title/artist/url triple with no duration or
// audio info of its own — unlike JioSaavn/Deezer's search APIs, confirming a
// text match here still requires fetching each candidate's own track page
// (getBandcampTrackDetails) before duration can even be checked, so that
// fetch only happens for candidates that already passed a tier's text bar,
// the same order of operations as deezerReplace.ts's per-candidate token
// resolution.
export async function findBandcampCandidate(
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
): Promise<BandcampHqCandidate | null> {
  if (!isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;
  // A Free Download match is this provider's best possible case — a track
  // already at or above that ceiling can never be improved here regardless
  // of whether any given candidate actually turns out to have one.
  if (currentBitrate !== null && currentBitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS) return null;

  const results = await searchBandcampTracks(`${artist} ${title}`.trim(), BANDCAMP_SEARCH_LIMIT);
  if (results.length === 0) return null;

  for (const tier of MATCH_TIERS) {
    // Best case for this tier (a Free Download match) still couldn't clear
    // its improvement bar — skip straight past it without even running text
    // match, same page-fetch-avoidance role this check played before, just
    // against the higher of the two possible outcomes now.
    if (currentBitrate !== null && MAX_PLAUSIBLE_MP3_BITRATE_KBPS <= currentBitrate + tier.minBitrateImprovementKbps) continue;

    for (const result of results) {
      if (!tier.textMatch(result.artist, result.title, artist, title)) continue;

      const details = await getBandcampTrackDetails(result.url);
      if (!details) continue;
      if (!isDurationPlausible(details.durationSec, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

      // Text + duration confirmed a real match — now find the best quality
      // Bandcamp will actually hand over for it. Most matches aren't Free
      // Download-enabled at all, in which case this falls back to the fixed
      // preview stream every track exposes regardless (see bandcamp.ts).
      const freeDownload = details.freeDownloadPage ? await getBandcampFreeDownloadUrl(details.freeDownloadPage) : null;
      const bitrate = freeDownload ? MAX_PLAUSIBLE_MP3_BITRATE_KBPS : BANDCAMP_STREAM_BITRATE_KBPS;
      // Only known per-candidate once a Free Download attempt has actually
      // resolved (or not) — re-checked here against this specific outcome
      // rather than trusting the tier-level best-case check above alone.
      if (currentBitrate !== null && bitrate <= currentBitrate + tier.minBitrateImprovementKbps) continue;

      console.log(
        `[bandcamp] Found: "${artist} - ${title}" -> "${details.artist} - ${details.title}"` +
          (freeDownload ? ` (free download, ${freeDownload.format}, ${bitrate}kbps)` : ` (preview stream, ${bitrate}kbps)`),
      );
      return { title: details.title, artist: details.artist, streamUrl: freeDownload?.url ?? details.streamUrl, bitrate };
    }
  }

  return null;
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`Bandcamp media download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
}

// Downloads a matched candidate from Bandcamp and replaces the shared mp3 for
// `video` in place, same contract as jiosaavnReplace.ts's downloadAndReplace
// (every PlaylistVideo row sharing the mediaFileId benefits; returns false
// without throwing on any failure, meaning "try again next sync"). Always
// re-encoded through transcodeToMp3 rather than published as-is — same
// reasoning as every other non-slskd source (see jiosaavnReplace.ts): it
// keeps this provider's output file uniform with theirs, and ffmpeg probes
// the actual content rather than trusting the source's extension, so this
// works whether `candidate.streamUrl` is Bandcamp's mp3-128 preview stream
// or a resolved Free Download (flac/wav/mp3-320) alike. The bitrate recorded
// below is `candidate.bitrate` itself, not always the transcode's own
// 320kbps CBR output — re-encoding the 128kbps preview stream up to a
// 320kbps container doesn't recover the fidelity it never had, so that case
// still gets recorded honestly at 128, matching hqReplace.ts's non-lossless
// branch (only a genuine Free Download resolves to the real 320 ceiling).
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  candidate: BandcampHqCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  // Publishes back to the file's *current* name — see hqReplace.ts's
  // downloadAndReplace for why this can't just reconstruct `${youtubeId}.mp3`.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: video.mediaFileId }, select: { filename: true } });
  if (!mediaFile) return false;

  console.log(`[bandcamp] Download started: ${video.youtubeId} ("${candidate.artist} - ${candidate.title}")`);

  const tmpDir = getTmpDir();
  const attemptId = `${video.youtubeId}-${randomUUID()}`;
  const tmpRawPath = join(tmpDir, `${attemptId}-raw.mp3`);
  const tmpMp3Path = join(tmpDir, `${attemptId}.mp3`);

  // Wraps the whole attempt so a late failure can never escape as an
  // uncaught rejection and always still cleans up tmp files — same "never
  // throws, always tidy" contract as the other providers' downloadAndReplace.
  try {
    await ensureSharedDirs();
    await downloadToFile(candidate.streamUrl, tmpRawPath);

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
    // videos where this is still false) — only true once a candidate
    // actually reached the real ceiling. A preview-stream-only match (128)
    // is still worth taking (it's a genuine improvement over whatever was
    // there before), but the file gets published and left flagged as
    // betterQualityExists so a future rescan keeps trying other sources
    // (or this one again, once/if the track's Free Download page appears)
    // instead of being permanently considered settled at 128.
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

    console.log(`[bandcamp] Download completed: ${video.youtubeId} (${tmpStats.size} bytes)`);
    return true;
  } catch (err) {
    console.error(`[bandcamp] HQ download/replace failed for ${video.youtubeId}:`, (err as Error).message);
    await unlink(tmpRawPath).catch(() => {});
    await unlink(tmpMp3Path).catch(() => {});
    return false;
  }
}
