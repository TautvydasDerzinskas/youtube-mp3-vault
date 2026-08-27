import { randomUUID } from 'crypto';
import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import {
  searchTidalTracks,
  getBestTidalTrackUrl,
  downloadTidalTrack,
  type TidalSession,
} from './tidal';
import { MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { MATCH_TIERS, isDurationPlausible } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';

// Last-resort HQ source, tried alongside Deezer/Qobuz only after slskd and
// JioSaavn (see hqReplace.ts/jiosaavnReplace.ts) come up empty — see
// slskdQualityWorker.ts for the exact ordering. Per-user rather than
// app-wide, same as Deezer/Qobuz: it only ever runs for a playlist whose
// owner has connected their own Tidal account (see routes/auth.ts's
// /tidal/start+poll endpoints and User.tidalAccessToken/tidalRefreshToken in
// schema.prisma), since it streams tracks that specific account is entitled
// to, not a shared catalog.
const TIDAL_SEARCH_LIMIT = 10;

export interface TidalHqCandidate {
  id: string;
  title: string;
  artist: string;
}

// Searches Tidal's public catalog for this track and returns the first
// exact-enough match (per the same tiered artist/title/duration confidence
// bar slskd/JioSaavn/Deezer/Qobuz use — see trackMatching.ts). Same shape as
// findQobuzCandidate — the track id from search is already everything
// getBestTidalTrackUrl needs, no separate token-lookup step.
export async function findTidalCandidate(
  session: TidalSession,
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
): Promise<TidalHqCandidate | null> {
  if (!isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;
  // Every quality this provider can offer (AAC up through Hi-Res FLAC) lands
  // at or above the MP3_320 ceiling once downloadAndReplace is done with it
  // (always transcoded down to it — Tidal never serves raw mp3) — so a track
  // already at that ceiling can never be improved here, same short-circuit
  // deezerReplace.ts/qobuzReplace.ts and hqReplace.ts's own caller
  // (resolvePlaylistQuality) apply.
  if (currentBitrate !== null && currentBitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS) return null;

  const query = `${artist} ${title}`.trim();
  const tracks = await searchTidalTracks(session, query, TIDAL_SEARCH_LIMIT);
  if (tracks.length === 0) return null;

  for (const tier of MATCH_TIERS) {
    for (const track of tracks) {
      if (!tier.textMatch(track.artist, track.title, artist, title)) continue;
      if (!isDurationPlausible(track.durationSec, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

      console.log(`[tidal] Found: "${artist} - ${title}" -> "${track.artist} - ${track.title}"`);
      return { id: track.id, title: track.title, artist: track.artist };
    }
  }

  // Temporary diagnostic: search returned real candidates but none passed
  // any tier — logs each one's title/duration next to ours so a rejection
  // (text mismatch vs. duration outside tolerance, see
  // durationToleranceSeconds in trackMatching.ts) is visible without
  // guessing. Remove once the "Silvana Imam - Tänd Alla Ljus" no-match
  // report is root-caused.
  console.log(
    `[tidal] No match for "${artist} - ${title}" (our duration=${videoDurationSec ?? 'unknown'}s) among ${tracks.length} candidate(s): ` +
    tracks.map((t) => `"${t.artist} - ${t.title}" (${t.durationSec ?? 'unknown'}s)`).join('; ')
  );
  return null;
}

// Downloads a matched candidate from Tidal and replaces the shared mp3 for
// `video` in place — same contract as hqReplace.ts/jiosaavnReplace.ts/
// deezerReplace.ts/qobuzReplace.ts's downloadAndReplace (every PlaylistVideo
// row sharing the mediaFileId benefits; returns false without throwing on
// any failure, meaning "try again next sync"). Unlike Qobuz (which can
// return a plain mp3 at its lowest tier), Tidal never serves mp3 at all —
// every tier is FLAC or AAC — so the downloaded file is always transcoded
// down to mp3 (this app's library is mp3-only throughout).
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  session: TidalSession,
  candidate: TidalHqCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  // Publishes back to the file's *current* name — see hqReplace.ts's
  // downloadAndReplace for why this can't just reconstruct `${youtubeId}.mp3`.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: video.mediaFileId }, select: { filename: true } });
  if (!mediaFile) return false;

  console.log(`[tidal] Download started: ${video.youtubeId} ("${candidate.artist} - ${candidate.title}")`);

  // Tries the best quality this account/track combination actually has,
  // falling all the way down to a low-bitrate AAC stream if no lossless
  // master exists for this particular track — see getBestTidalTrackUrl's
  // own doc comment.
  const stream = await getBestTidalTrackUrl(session, candidate.id);
  if (!stream) {
    console.error(`[tidal] Aborting ${video.youtubeId}: no download URL for "${candidate.artist} - ${candidate.title}"`);
    return false;
  }

  const tmpDir = getTmpDir();
  const attemptId = `${video.youtubeId}-${randomUUID()}`;
  // Extension is cosmetic only (ffmpeg probes the actual container/codec
  // rather than trusting it) — picked just to make a stray leftover tmp file
  // recognizable during debugging.
  const rawExt = stream.quality === 'LOSSLESS' || stream.quality === 'HI_RES_LOSSLESS' ? 'flac' : 'm4a';
  const tmpRawPath = join(tmpDir, `${attemptId}.${rawExt}`);
  const tmpMp3Path = join(tmpDir, `${attemptId}.mp3`);

  // Wraps the whole attempt so a late failure can never escape as an
  // uncaught rejection and always still cleans up tmp files — same "never
  // throws, always tidy" contract as the other providers' downloadAndReplace.
  try {
    await ensureSharedDirs();
    await downloadTidalTrack(stream, tmpRawPath);

    const transcoded = await transcodeToMp3(tmpRawPath, tmpMp3Path);
    await unlink(tmpRawPath).catch(() => {});
    if (!transcoded) {
      await unlink(tmpMp3Path).catch(() => {});
      return false;
    }

    const publishedStats = await stat(tmpMp3Path);
    await publishToSharedStore(tmpMp3Path, mediaFile.filename);

    // Unconditionally true here, same reasoning as deezerReplace.ts/
    // qobuzReplace.ts's downloadAndReplace: every path this function can
    // succeed through lands at MAX_PLAUSIBLE_MP3_BITRATE_KBPS by
    // construction (always transcoded to it), never a variable per-track
    // bitrate like slskd/Bandcamp.
    await prisma.mediaFile.update({
      where: { id: video.mediaFileId },
      data: { fileSize: publishedStats.size, bitrate: MAX_PLAUSIBLE_MP3_BITRATE_KBPS },
    });
    await prisma.playlistVideo.updateMany({
      where: { mediaFileId: video.mediaFileId },
      data: {
        hqFileDownloaded: true,
        betterQualityExists: false,
        bitrate: MAX_PLAUSIBLE_MP3_BITRATE_KBPS,
        fileSize: publishedStats.size,
        qualityCheckStatus: 'checked',
        qualityCheckedAt: new Date(),
      },
    });

    console.log(`[tidal] Download completed: ${video.youtubeId} (${publishedStats.size} bytes)`);
    return true;
  } catch (err) {
    console.error(`[tidal] HQ download/replace failed for ${video.youtubeId}:`, (err as Error).message);
    await unlink(tmpRawPath).catch(() => {});
    await unlink(tmpMp3Path).catch(() => {});
    return false;
  }
}
