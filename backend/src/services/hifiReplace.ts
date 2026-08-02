import { unlink, stat } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { MATCH_TIERS, isDurationPlausible } from './trackMatching';
import { transcodeToMp3 } from './audioTranscode';
import { publishToSharedStore, ensureSharedDirs, getTmpDir } from './downloader';
import { HiFiClient } from './hifi/hifiClient';
import { HiFiPreviewOnlyError } from './hifi/errors';
import type { ParsedTrack } from './hifi/types';

// HQ source, tried first (see slskdQualityWorker.ts) — HiFi is a free,
// Tidal-backed catalog reached through public, unauthenticated hifi-api
// instances, hit via a single fast JSON search call rather than slskd's
// several-second peer-search settle wait, so putting it first resolves the
// common case quickly. slskd is still tried next for whatever HiFi doesn't
// have, then JioSaavn last (mostly karaoke/cover versions).
const HIFI_SEARCH_LIMIT = 20;

// Ceiling for the *search* call specifically — HiFiHttpClient.apiGet cycles
// through every configured instance (currently 7) at up to requestTimeoutMs
// (15s) each on its own, so an instance pool that's technically reachable
// but just slow (not cleanly refusing connections) could otherwise take well
// over a minute before this gives up — directly undercutting the reason
// HiFi is tried first at all (finding the common case fast). Passed as
// searchTracks' AbortSignal, which bounds the whole pool-cycling loop, not
// just one request — see hifi/httpClient.ts's apiGet. An outright-down
// instance fails near-instantly (connection refused, not a timeout), so this
// mainly caps how long we tolerate an instance that's up but hanging — set
// to roughly 1.5x a single request's own timeout, enough room for one slow
// attempt plus a couple of fast failures around it, without approaching the
// full multi-minute worst case of exhausting the whole pool.
const HIFI_SEARCH_TIMEOUT_MS = 22_000;

// Generous ceiling for one track's whole download attempt — same rationale
// as every other per-track network timeout in this app (see slskd.ts's
// DOWNLOAD_MAX_WAIT_MS/jiosaavnReplace.ts's DOWNLOAD_TIMEOUT_MS), just
// larger: unlike those, a single HiFi attempt can cascade through several
// quality tiers (hires -> lossless -> high -> low), each a full HLS
// segment-by-segment download with its own retries, against public
// instances that are known to be flaky. Passed straight through as
// downloadTrack's AbortSignal, so it bounds the segment-download phase
// specifically — by the time this runs, findHiFiCandidate above has already
// confirmed HiFi is reachable and has a match, so a long ceiling here is
// about tolerating a slow transfer, not about detecting "HiFi is down."
const HIFI_DOWNLOAD_TIMEOUT_MS = 8 * 60_000;

const hifiClient = new HiFiClient({ downloadPath: getTmpDir() });

export interface HiFiCandidate {
  trackId: number;
  title: string;
  artist: string;
  displayName: string;
  bitrate: number;
}

function candidateDurationSeconds(track: ParsedTrack): number | null {
  return track.durationMs > 0 ? track.durationMs / 1000 : null;
}

// Searches HiFi for this track and returns the best match that beats
// currentBitrate, per the same tiered artist/title/duration confidence bar
// slskd and JioSaavn use (see trackMatching.ts). `bitrate` is always reported
// as the ceiling this app treats as "the highest plausible real mp3 bitrate"
// — regardless of which HiFi quality tier (FLAC hires/lossless, AAC
// high/low) actually ends up delivered, downloadAndReplace below always
// transcodes to a fixed 320kbps mp3, so that's the only bitrate that's ever
// actually true of the published file.
export async function findHiFiCandidate(
  artist: string,
  title: string,
  currentBitrate: number | null,
  videoDurationSec: number | null,
): Promise<HiFiCandidate | null> {
  if (!isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;

  let tracks: ParsedTrack[];
  try {
    tracks = await hifiClient.searchTracks({ artist, title, limit: HIFI_SEARCH_LIMIT }, AbortSignal.timeout(HIFI_SEARCH_TIMEOUT_MS));
  } catch {
    return null;
  }
  if (tracks.length === 0) return null;

  for (const tier of MATCH_TIERS) {
    if (currentBitrate !== null && MAX_PLAUSIBLE_MP3_BITRATE_KBPS <= currentBitrate + tier.minBitrateImprovementKbps) continue;

    for (const track of tracks) {
      if (track.id === null) continue;
      if (!tier.textMatch(track.artist, track.title, artist, title)) continue;
      if (!isDurationPlausible(candidateDurationSeconds(track), videoDurationSec, tier.durationStrictness, tier.requireKnownDuration)) continue;

      return {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        displayName: `${track.artist} - ${track.title}`,
        bitrate: MAX_PLAUSIBLE_MP3_BITRATE_KBPS,
      };
    }
  }

  return null;
}

// Downloads a matched candidate from HiFi and replaces the shared mp3 for
// `video` in place — same contract as hqReplace.ts/jiosaavnReplace.ts's
// versions (every PlaylistVideo row sharing the mediaFileId benefits; never
// throws, returns false on any failure, meaning "try again next sync"). Every
// HiFi quality tier (FLAC or AAC) is transcoded to mp3 the same way JioSaavn's
// AAC is — this app's library is mp3-only throughout.
export async function downloadAndReplace(
  video: { id: string; youtubeId: string; mediaFileId: string | null },
  candidate: HiFiCandidate,
): Promise<boolean> {
  if (!video.mediaFileId) return false;

  const tmpMp3Path = join(getTmpDir(), `${video.youtubeId}-${randomUUID()}.mp3`);
  let sourceFilePath: string | null = null;

  try {
    await ensureSharedDirs();
    const result = await hifiClient.downloadTrack(candidate.trackId, `${video.youtubeId}-${randomUUID()}`, {
      signal: AbortSignal.timeout(HIFI_DOWNLOAD_TIMEOUT_MS),
    });
    sourceFilePath = result.filePath;

    // 'low' is 96kbps AAC — below what most YouTube sources already are.
    // HiFiClient cascades down to it only when hires/lossless/high all failed
    // or previewed out; accepting it here would mean reporting a fake
    // 320kbps bitrate for what's actually a downgrade. Discard and let the
    // caller treat this the same as "no upgrade found" rather than publish it.
    if (result.quality === 'low') {
      await unlink(sourceFilePath).catch(() => {});
      return false;
    }

    const transcoded = await transcodeToMp3(sourceFilePath, tmpMp3Path);
    await unlink(sourceFilePath).catch(() => {});
    sourceFilePath = null;
    if (!transcoded) {
      await unlink(tmpMp3Path).catch(() => {});
      return false;
    }

    const tmpStats = await stat(tmpMp3Path);
    await publishToSharedStore(tmpMp3Path, `${video.youtubeId}.mp3`);

    await prisma.mediaFile.update({
      where: { id: video.mediaFileId },
      data: { fileSize: tmpStats.size, bitrate: MAX_PLAUSIBLE_MP3_BITRATE_KBPS },
    });
    await prisma.playlistVideo.updateMany({
      where: { mediaFileId: video.mediaFileId },
      data: {
        hqFileDownloaded: true,
        betterQualityExists: false,
        bitrate: MAX_PLAUSIBLE_MP3_BITRATE_KBPS,
        fileSize: tmpStats.size,
        qualityCheckStatus: 'checked',
        qualityCheckedAt: new Date(),
      },
    });

    return true;
  } catch (err) {
    // HiFiPreviewOnlyError means "this source only has a truncated clip of
    // this track" — an expected, informative outcome (see errors.ts), not a
    // surprising failure, so it's worth its own log line rather than being
    // indistinguishable from a real error.
    const label = err instanceof HiFiPreviewOnlyError ? 'preview-only' : 'failed';
    console.error(`[hifi] HQ download ${label} for ${video.youtubeId}:`, (err as Error).message);
    if (sourceFilePath) await unlink(sourceFilePath).catch(() => {});
    await unlink(tmpMp3Path).catch(() => {});
    return false;
  }
}
