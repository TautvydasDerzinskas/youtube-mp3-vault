import { randomUUID } from 'crypto';
import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import {
  searchDeezerTracks,
  getDeezerTrackToken,
  getSongDownloadUrl,
  downloadAndDecryptTrack,
  type DeezerSession,
  type DeezerFormat,
} from './deezer';
import { MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { MATCH_TIERS, isDurationPlausible, type MatchTier, type NearMissCandidate } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';

// Last-resort HQ source, tried only after both slskd and JioSaavn (see
// hqReplace.ts/jiosaavnReplace.ts) come up empty — see slskdQualityWorker.ts
// for why it's ordered last. Unlike those two, this one is per-user rather
// than app-wide: it only ever runs for a playlist whose owner has connected
// their own Deezer account (see routes/auth.ts's /deezer endpoints and
// User.deezerArlCookie in schema.prisma), since it streams tracks that
// specific account is entitled to, not a shared/free catalog.
const DEEZER_SEARCH_LIMIT = 10;

export interface DeezerHqCandidate {
  sngId: string;
  trackToken: string;
  title: string;
  artist: string;
}

// Searches Deezer's public catalog for this track and returns the first
// exact-enough match (per the same tiered artist/title/duration confidence
// bar slskd/JioSaavn use — see trackMatching.ts), then resolves it to the
// TRACK_TOKEN/SNG_ID pair actually needed to download it. Quality itself
// isn't a factor in matching here the way it is for slskd/JioSaavn (which
// each juggle a range of bitrates) — `session.format` already pinned this
// account to a single fixed quality (FLAC or MP3_320) when the session was
// established, so any match is already the best this account can offer.
export async function findDeezerCandidate(
  session: DeezerSession,
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
  // Overridable so the rename-triggered HQ search can pass
  // MATCH_TIERS_TRUSTED_NAME instead — see that constant's own doc comment.
  tiers: MatchTier[] = MATCH_TIERS,
  // Populated with every raw search result whenever none of them clear any
  // tier — see NearMissCandidate's own doc comment. Left undefined by every
  // caller that doesn't want this (the batch sync pass), which skips the
  // collection entirely.
  nearMisses?: NearMissCandidate[],
  // What to actually compare a candidate against — defaults to `artist`/
  // `title` above. The caller only ever passes something different when
  // retrying with a cleaned-up query (see checkVideoQuality's
  // hasCleanedFallback and stripFeaturedArtists' own doc comment): cleaning
  // a cluttered "(feat. X)" out of the query is meant to help the search
  // itself return better results, not to change what counts as a match —
  // the real candidate's own title still legitimately has that feat. credit,
  // so comparing against the un-cleaned original is what actually verifies
  // it's the same recording.
  matchArtist: string = artist,
  matchTitle: string = title,
): Promise<DeezerHqCandidate | null> {
  if (!isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;
  // Both FLAC and MP3_320 land at the same 320kbps-mp3 ceiling once
  // downloadAndReplace is done with them (FLAC gets transcoded down to it,
  // MP3_320 already is it) — so a track already at that ceiling can never
  // be improved by this provider, same short-circuit hqReplace.ts's own
  // caller (resolvePlaylistQuality) applies before calling any provider.
  if (currentBitrate !== null && currentBitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS) return null;

  const query = `${artist} ${title}`.trim();
  const tracks = await searchDeezerTracks(query, DEEZER_SEARCH_LIMIT);
  if (tracks.length === 0) return null;

  for (const tier of tiers) {
    for (const track of tracks) {
      if (!tier.textMatch(track.artist, track.title, matchArtist, matchTitle)) continue;
      if (!isDurationPlausible(track.durationSec, videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

      const tokenInfo = await getDeezerTrackToken(session.cookieHeader, track.id);
      if (!tokenInfo) continue; // e.g. region-blocked on this account — try the next tied candidate

      console.log(`[deezer] Found: "${artist} - ${title}" -> "${track.artist} - ${track.title}" (${session.format})`);
      return { sngId: tokenInfo.sngId, trackToken: tokenInfo.trackToken, title: track.title, artist: track.artist };
    }
  }

  nearMisses?.push(...tracks.map((t) => ({ artist: t.artist, title: t.title, durationSec: t.durationSec, previewUrl: t.previewUrl })));
  return null;
}

// Downloads a matched candidate from Deezer and replaces the shared mp3 for
// `video` in place — same contract as hqReplace.ts/jiosaavnReplace.ts's
// downloadAndReplace (every PlaylistVideo row sharing the mediaFileId
// benefits; returns false without throwing on any failure, meaning "try
// again next sync"). A FLAC source is always transcoded down to mp3 (this
// app's library is mp3-only throughout, same as every other non-YouTube
// source); an MP3_320 source is already in the right format and used as-is.
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  session: DeezerSession,
  candidate: DeezerHqCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  // Publishes back to the file's *current* name — see hqReplace.ts's
  // downloadAndReplace for why this can't just reconstruct `${youtubeId}.mp3`.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { id: video.mediaFileId }, select: { filename: true } });
  if (!mediaFile) return false;

  console.log(`[deezer] Download started: ${video.youtubeId} ("${candidate.artist} - ${candidate.title}", ${session.format})`);

  // session.format is negotiated once per sync pass against a single probe
  // track (see establishDeezerSession) — it reflects what the account is
  // entitled to, not what every individual track actually has a master for.
  // FLAC masters aren't universal (especially for remixes/underground
  // tracks), so a FLAC miss here falls back to MP3_320 for this track alone
  // rather than aborting outright, same as the probe itself already does.
  let format: DeezerFormat = session.format;
  let mediaUrl = await getSongDownloadUrl(session.licenseToken, candidate.trackToken, format);
  if (!mediaUrl && format === 'FLAC') {
    console.log(`[deezer] No FLAC master for ${video.youtubeId} ("${candidate.artist} - ${candidate.title}") — falling back to MP3_320`);
    format = 'MP3_320';
    mediaUrl = await getSongDownloadUrl(session.licenseToken, candidate.trackToken, format);
  }
  if (!mediaUrl) {
    console.error(`[deezer] Aborting ${video.youtubeId}: no download URL for "${candidate.artist} - ${candidate.title}"`);
    return false;
  }

  const isFlac = format === 'FLAC';
  const tmpDir = getTmpDir();
  const attemptId = `${video.youtubeId}-${randomUUID()}`;
  const tmpRawPath = join(tmpDir, `${attemptId}.${isFlac ? 'flac' : 'mp3'}`);
  const tmpMp3Path = join(tmpDir, `${attemptId}.mp3`);

  // Wraps the whole attempt so a late failure can never escape as an
  // uncaught rejection and always still cleans up tmp files — same "never
  // throws, always tidy" contract as the other two providers' downloadAndReplace.
  try {
    await ensureSharedDirs();
    await downloadAndDecryptTrack(mediaUrl, candidate.sngId, tmpRawPath);

    let publishSourcePath = tmpRawPath;
    if (isFlac) {
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

    // Unlike the other three providers' downloadAndReplace, hqFileDownloaded
    // is unconditionally true here rather than gated on reaching the real
    // ceiling — not an oversight, this provider genuinely always does:
    // every path this function can succeed through (FLAC, or the MP3_320
    // fallback above) lands at MAX_PLAUSIBLE_MP3_BITRATE_KBPS by
    // construction, never a variable per-track bitrate like slskd/Bandcamp.
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

    console.log(`[deezer] Download completed: ${video.youtubeId} (${publishedStats.size} bytes)`);
    return true;
  } catch (err) {
    console.error(`[deezer] HQ download/replace failed for ${video.youtubeId}:`, (err as Error).message);
    await unlink(tmpRawPath).catch(() => {});
    await unlink(tmpMp3Path).catch(() => {});
    return false;
  }
}
