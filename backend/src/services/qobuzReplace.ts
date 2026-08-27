import { randomUUID } from 'crypto';
import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import {
  searchQobuzTracks,
  getBestQobuzTrackUrl,
  downloadQobuzTrack,
  type QobuzSession,
} from './qobuz';
import { MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { MATCH_TIERS, isDurationPlausible, type MatchTier } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';

// Last-resort HQ source, tried alongside Deezer only after slskd and
// JioSaavn (see hqReplace.ts/jiosaavnReplace.ts) come up empty — see
// slskdQualityWorker.ts for the exact ordering. Per-user rather than
// app-wide, same as Deezer: it only ever runs for a playlist whose owner
// has connected their own Qobuz account (see routes/auth.ts's /qobuz
// endpoints and User.qobuzEmail/qobuzPassword in schema.prisma), since it
// streams tracks that specific account is entitled to, not a shared catalog.
const QOBUZ_SEARCH_LIMIT = 10;

export interface QobuzHqCandidate {
  id: string;
  title: string;
  artist: string;
}

// Searches Qobuz's public catalog for this track and returns the first
// exact-enough match (per the same tiered artist/title/duration confidence
// bar slskd/JioSaavn/Deezer use — see trackMatching.ts). Unlike Deezer,
// there's no separate token-lookup step needed here — the track id from
// search is already everything getBestQobuzTrackUrl needs.
export async function findQobuzCandidate(
  session: QobuzSession,
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
  // Overridable so the rename-triggered HQ search can pass
  // MATCH_TIERS_TRUSTED_NAME instead — see that constant's own doc comment.
  tiers: MatchTier[] = MATCH_TIERS,
): Promise<QobuzHqCandidate | null> {
  if (!isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;
  // Every quality this provider can offer (MP3 320 up through Hi-Res FLAC)
  // lands at or above the MP3_320 ceiling once downloadAndReplace is done
  // with it (FLAC gets transcoded down to it) — so a track already at that
  // ceiling can never be improved here, same short-circuit deezerReplace.ts
  // and hqReplace.ts's own caller (resolvePlaylistQuality) apply.
  if (currentBitrate !== null && currentBitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS) return null;

  const query = `${artist} ${title}`.trim();
  const tracks = await searchQobuzTracks(query, QOBUZ_SEARCH_LIMIT);
  if (tracks.length === 0) return null;

  for (const tier of tiers) {
    for (const track of tracks) {
      if (!tier.textMatch(track.artist, track.title, artist, title)) continue;
      if (!isDurationPlausible(track.durationSec, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

      console.log(`[qobuz] Found: "${artist} - ${title}" -> "${track.artist} - ${track.title}"`);
      return { id: track.id, title: track.title, artist: track.artist };
    }
  }

  return null;
}

// Downloads a matched candidate from Qobuz and replaces the shared mp3 for
// `video` in place — same contract as hqReplace.ts/jiosaavnReplace.ts/
// deezerReplace.ts's downloadAndReplace (every PlaylistVideo row sharing the
// mediaFileId benefits; returns false without throwing on any failure,
// meaning "try again next sync"). A FLAC/Hi-Res source is always transcoded
// down to mp3 (this app's library is mp3-only throughout, same as every
// other non-YouTube source); an MP3 320 source is already in the right
// format and used as-is.
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  session: QobuzSession,
  candidate: QobuzHqCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  // Publishes back to the file's *current* name — see hqReplace.ts's
  // downloadAndReplace for why this can't just reconstruct `${youtubeId}.mp3`.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: video.mediaFileId }, select: { filename: true } });
  if (!mediaFile) return false;

  console.log(`[qobuz] Download started: ${video.youtubeId} ("${candidate.artist} - ${candidate.title}")`);

  // Tries the best quality this account/track combination actually has,
  // falling all the way down to MP3 320 if no lossless master exists for
  // this particular track — see getBestQobuzTrackUrl's own doc comment.
  const resolved = await getBestQobuzTrackUrl(session, candidate.id);
  if (!resolved) {
    console.error(`[qobuz] Aborting ${video.youtubeId}: no download URL for "${candidate.artist} - ${candidate.title}"`);
    return false;
  }

  const isMp3 = resolved.formatId === 5;
  const tmpDir = getTmpDir();
  const attemptId = `${video.youtubeId}-${randomUUID()}`;
  const tmpRawPath = join(tmpDir, `${attemptId}.${isMp3 ? 'mp3' : 'flac'}`);
  const tmpMp3Path = join(tmpDir, `${attemptId}.mp3`);

  // Wraps the whole attempt so a late failure can never escape as an
  // uncaught rejection and always still cleans up tmp files — same "never
  // throws, always tidy" contract as the other providers' downloadAndReplace.
  try {
    await ensureSharedDirs();
    await downloadQobuzTrack(resolved.url, tmpRawPath);

    let publishSourcePath = tmpRawPath;
    if (!isMp3) {
      const transcoded = await transcodeToMp3(tmpRawPath, tmpMp3Path);
      await unlink(tmpRawPath).catch(() => {});
      if (!transcoded) {
        await unlink(tmpMp3Path).catch(() => {});
        return false;
      }
      publishSourcePath = tmpMp3Path;
    }

    const publishedStats = await stat(publishSourcePath);
    await publishToSharedStore(publishSourcePath, mediaFile.filename);

    // Unconditionally true here, same reasoning as deezerReplace.ts's
    // downloadAndReplace: every path this function can succeed through
    // (any FLAC tier, or the MP3 320 floor) lands at
    // MAX_PLAUSIBLE_MP3_BITRATE_KBPS by construction, never a variable
    // per-track bitrate like slskd/Bandcamp.
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

    console.log(`[qobuz] Download completed: ${video.youtubeId} (${publishedStats.size} bytes)`);
    return true;
  } catch (err) {
    console.error(`[qobuz] HQ download/replace failed for ${video.youtubeId}:`, (err as Error).message);
    await unlink(tmpRawPath).catch(() => {});
    await unlink(tmpMp3Path).catch(() => {});
    return false;
  }
}
