import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { findBetterQualityMp3, MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { isHqAutoDownloadEnabled } from './settings';
import { findExactMatchCandidate, downloadAndReplace as downloadAndReplaceViaSlskd } from './hqReplace';
import { findHiFiCandidate, downloadAndReplace as downloadAndReplaceViaHiFi } from './hifiReplace';
import { findJioSaavnCandidate, downloadAndReplace as downloadAndReplaceViaJioSaavn } from './jiosaavnReplace';

// Checks slskd for a better-quality mp3 of each downloaded video in this
// playlist. Called at the end of a playlist's download pass (see
// downloadPendingVideos in syncService.ts), same as resolvePlaylistMetadata
// right before it — deliberately after metadata resolution, not before, so
// `video.artist` is already populated by whatever MusicBrainz/the local
// fallback found for it by the time this runs.
//
// By default only checks videos still awaiting a first check
// (`qualityCheckStatus: 'pending'`) — this is what every regular sync's
// automatic follow-up pass uses, so routine syncs don't re-search slskd for
// tracks already checked. Pass `rescanAll: true` (used by the admin-facing
// "Scan for HQ" trigger — see scanForHqUpgrades in syncService.ts) to
// instead recheck every video that doesn't already have a real HQ file on
// disk (`hqFileDownloaded: false`), regardless of what a past check found —
// slskd's peer pool changes constantly (different users online at different
// times of day), so "no match last time" is never a permanent verdict the
// way it's currently treated; only "we already have the upgraded file" is.
//
// When the "auto-download HQ upgrades" admin toggle is on (see
// services/hqReplace.ts — meant to pair with a modified, purchaser-IP-gated
// slskd image), this does more than the plain search-only path: an exact
// artist+title match gets downloaded and used to replace the local file
// outright, not just flagged as available. Three sources are tried in order,
// each only attempted once the one before it comes up empty: HiFi first
// (services/hifiReplace.ts — a free, Tidal-backed catalog via public hifi-api
// instances, hit with one fast JSON search rather than a peer-search settle
// wait, and in practice has a larger catalog than slskd — so putting it
// first resolves the common case quickly, without paying slskd's own several
// second search-settle cost on tracks it wouldn't have had anyway), then
// slskd for whatever HiFi doesn't have (findHiFiCandidate is bounded by its
// own short search-timeout — see HIFI_SEARCH_TIMEOUT_MS in hifiReplace.ts —
// so an unreachable/slow HiFi instance pool falls through to slskd quickly
// rather than stalling the whole check), then JioSaavn
// (services/jiosaavnReplace.ts) last, since its catalog mostly turns up
// karaoke/cover versions rather than the real recording.
// That path in particular can take a while per video (a real slskd search
// plus, when a match is found, an actual file transfer) — onProgress (only
// syncService.ts's downloadPendingVideos passes one) reports this video's
// 1-indexed position and running total before each one is processed, so the
// caller can surface live progress instead of this looking indistinguishable
// from stuck.
export async function resolvePlaylistQuality(
  playlistId: string,
  options: { onProgress?: (current: number, total: number, title: string) => void; rescanAll?: boolean } = {}
): Promise<void> {
  const { onProgress, rescanAll = false } = options;
  const videos = await prisma.playlistVideo.findMany({
    where: rescanAll
      ? { playlistId, downloadStatus: 'done', hqFileDownloaded: false }
      : { playlistId, downloadStatus: 'done', qualityCheckStatus: 'pending' },
    orderBy: { position: 'asc' },
  });

  for (const [index, video] of videos.entries()) {
    if (!isOnline()) return;
    onProgress?.(index + 1, videos.length, video.artist ? `${video.artist} - ${video.title}` : video.title);

    // Already at (or somehow above) the ceiling this app treats as the
    // highest plausible real mp3 bitrate — slskd.ts's own search discards
    // any peer file reporting a higher bitrate as bogus data, so no search
    // here could ever legitimately find something better. Skip it outright
    // rather than spending a slskd round-trip to prove that. Standard
    // YouTube audio-only streams don't actually reach this on their own
    // (topping out around 128–256kbps depending on what's available for a
    // given video) — this mostly matters for a track already carrying a
    // genuinely maxed-out bitrate from some other source.
    if (video.bitrate !== null && video.bitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS) {
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() } })
        .catch(() => {});
      continue;
    }

    if (!video.artist) {
      // metadataStatus 'pending' means a future sync's metadata pass might
      // still fill this in — leave it pending too rather than giving up for
      // good. Any other status is terminal (see resolvePlaylistMetadata),
      // meaning no artist is ever coming for this video, so there's nothing
      // left to search with.
      if (video.metadataStatus === 'pending') continue;
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() } })
        .catch(() => {});
      continue;
    }

    try {
      if (isHqAutoDownloadEnabled()) {
        let hifiCandidate: Awaited<ReturnType<typeof findHiFiCandidate>> = null;
        let slskdCandidate: Awaited<ReturnType<typeof findExactMatchCandidate>> = null;
        let jioSaavnCandidate: Awaited<ReturnType<typeof findJioSaavnCandidate>> = null;
        let replaced = false;

        // Each source is isolated in its own try/catch — an unexpected
        // failure on one (a slskd daemon hiccup, a hifi-api/JioSaavn API
        // error) is logged and treated the same as "this source found
        // nothing", not something that aborts the whole quality check for
        // this video or stops the next source from still being tried. Every
        // function called here is already designed not to throw for the
        // ordinary "no match"/"download failed" cases (see hqReplace.ts,
        // hifiReplace.ts, jiosaavnReplace.ts) — this is a backstop for the
        // unexpected case.
        try {
          hifiCandidate = await findHiFiCandidate(video.artist, video.title, video.bitrate, video.duration);
          if (hifiCandidate) replaced = await downloadAndReplaceViaHiFi(video, hifiCandidate);
        } catch (err) {
          console.error(`[hifi] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
        }

        if (!replaced && !hifiCandidate) {
          // HiFi came up empty (or errored/timed out — see
          // HIFI_SEARCH_TIMEOUT_MS) — fall back to slskd before trying
          // JioSaavn.
          try {
            slskdCandidate = await findExactMatchCandidate(video.artist, video.title, video.bitrate, video.duration);
            if (slskdCandidate) replaced = await downloadAndReplaceViaSlskd(video, slskdCandidate);
          } catch (err) {
            console.error(`[slskd] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && !hifiCandidate && !slskdCandidate) {
          // Neither HiFi nor slskd found anything — last resort: JioSaavn's
          // free public catalog (mostly karaoke/covers, so tried last).
          try {
            jioSaavnCandidate = await findJioSaavnCandidate(video.artist, video.title, video.bitrate, video.duration);
            if (jioSaavnCandidate) replaced = await downloadAndReplaceViaJioSaavn(video, jioSaavnCandidate);
          } catch (err) {
            console.error(`[jiosaavn] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (replaced) continue; // downloadAndReplace* already updated every flag/status itself

        if (!slskdCandidate && !hifiCandidate && !jioSaavnCandidate) {
          // No source found anything eligible right now — a stable,
          // repeatable verdict, same as the free path below.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() },
          });
          continue;
        }

        // A real upgrade exists (on one source or another) but
        // downloading/replacing it didn't succeed this time (transient
        // failure, peer/agent unavailable, file never showed up on the
        // shared downloads volume in time — see hqReplace.ts) — flag it as
        // available and leave qualityCheckStatus pending so the next sync
        // retries the download, rather than a one-off failure permanently
        // giving up on it.
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: { betterQualityExists: true },
        });
        continue;
      }

      const betterBitrate = await findBetterQualityMp3(video.artist, video.title, video.bitrate);
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: {
          betterQualityExists: betterBitrate !== null,
          qualityCheckStatus: 'checked',
          qualityCheckedAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      console.error(`[slskd] Quality check failed for ${video.youtubeId}:`, (err as Error).message);
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'error', qualityCheckedAt: new Date() } })
        .catch(() => {});
    }
  }
}
