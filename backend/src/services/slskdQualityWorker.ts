import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { findBetterQualityMp3, MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { isHqAutoDownloadEnabled, isUserHqProviderAllowed } from './settings';
import { findExactMatchCandidate, downloadAndReplace as downloadAndReplaceViaSlskd } from './hqReplace';
import { findJioSaavnCandidate, downloadAndReplace as downloadAndReplaceViaJioSaavn } from './jiosaavnReplace';
import { establishDeezerSession, type DeezerSession } from './deezer';
import { findDeezerCandidate, downloadAndReplace as downloadAndReplaceViaDeezer } from './deezerReplace';

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
// outright, not just flagged as available. slskd is tried first (it's
// generally the better/more current source when it has a match); if it
// comes up empty, JioSaavn (services/jiosaavnReplace.ts) is tried as a
// fallback — a free public catalog with no peer pool to wait on, so it
// costs one extra search rather than a real wait when slskd has nothing. If
// that also comes up empty and this playlist's owner has connected their own
// Deezer account (services/deezer.ts/deezerReplace.ts), Deezer is tried
// last — unlike the other two, it's per-user, not app-wide, since it
// streams tracks that specific account is entitled to. Its cookie is
// verified once per call, up front (see deezerSession below), not
// per-video: a dead/expired cookie should stop being retried for the rest
// of this sync pass rather than failing the same way on every remaining
// video. That path in particular can take a while per video (a real slskd
// search plus, when a match is found, an actual file transfer) —
// onProgress (only syncService.ts's downloadPendingVideos passes one)
// reports this video's 1-indexed position and running total before each
// one is processed, so the caller can surface live progress instead of
// this looking indistinguishable from stuck.
export async function resolvePlaylistQuality(
  playlistId: string,
  options: {
    onProgress?: (current: number, total: number, title: string) => void;
    // Fired once per video that gets a *new* upgrade this pass — either
    // actually downloaded (auto-download mode) or just newly flagged
    // available — never for a video whose upgrade was already known from a
    // past check, even under rescanAll. Only syncService.ts's
    // downloadPendingVideos passes one, to accumulate SyncStats.newHqCount.
    onHqFound?: () => void;
    rescanAll?: boolean;
  } = {}
): Promise<void> {
  const { onProgress, onHqFound, rescanAll = false } = options;
  const videos = await prisma.playlistVideo.findMany({
    where: rescanAll
      ? { playlistId, downloadStatus: 'done', hqFileDownloaded: false }
      : { playlistId, downloadStatus: 'done', qualityCheckStatus: 'pending' },
    orderBy: { position: 'asc' },
  });

  // Established once per call (i.e. once per sync pass for this playlist),
  // never per video — see the block comment above for why. null means any
  // of: the admin has disabled Deezer entirely (hqAllowedUserProviders,
  // checked first so a disabled provider never even attempts a network
  // call), the owner hasn't connected it, or their cookie is currently
  // unusable (dead/expired, or no HQ-entitled Deezer plan) — either way
  // every video below simply skips this provider, same as if it didn't exist.
  let deezerSession: DeezerSession | null = null;
  if (isHqAutoDownloadEnabled() && isUserHqProviderAllowed('deezer') && videos.length > 0) {
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true, user: { select: { deezerArlCookie: true } } },
    });
    if (playlist?.user.deezerArlCookie) {
      deezerSession = await establishDeezerSession(playlist.user.deezerArlCookie);
      await prisma.user
        .update({
          where: { id: playlist.userId },
          data: { deezerCookieValid: deezerSession !== null, deezerCookieCheckedAt: new Date() },
        })
        .catch(() => {});
    }
  }

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
        let slskdCandidate: Awaited<ReturnType<typeof findExactMatchCandidate>> = null;
        let jioSaavnCandidate: Awaited<ReturnType<typeof findJioSaavnCandidate>> = null;
        let deezerCandidate: Awaited<ReturnType<typeof findDeezerCandidate>> = null;
        let replaced = false;

        // Each source is isolated in its own try/catch — an unexpected
        // failure on one (a slskd daemon hiccup, a JioSaavn API error) is
        // logged and treated the same as "this source found nothing", not
        // something that aborts the whole quality check for this video or
        // stops the other source from still being tried. Every function
        // called here is already designed not to throw for the ordinary
        // "no match"/"download failed" cases (see hqReplace.ts and
        // jiosaavnReplace.ts) — this is a backstop for the unexpected case.
        try {
          slskdCandidate = await findExactMatchCandidate(video.artist, video.title, video.bitrate, video.duration);
          if (slskdCandidate) replaced = await downloadAndReplaceViaSlskd(video, slskdCandidate);
        } catch (err) {
          console.error(`[slskd] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
        }

        if (!replaced && !slskdCandidate) {
          // slskd came up empty (or errored) — fall back to JioSaavn's free
          // public catalog before giving up on this video for this pass.
          try {
            jioSaavnCandidate = await findJioSaavnCandidate(video.artist, video.title, video.bitrate, video.duration);
            if (jioSaavnCandidate) replaced = await downloadAndReplaceViaJioSaavn(video, jioSaavnCandidate);
          } catch (err) {
            console.error(`[jiosaavn] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && !slskdCandidate && !jioSaavnCandidate && deezerSession) {
          // Both free sources came up empty — last resort is this
          // playlist's owner's own Deezer account, already confirmed usable
          // once up front for this whole sync pass (see deezerSession above).
          try {
            deezerCandidate = await findDeezerCandidate(deezerSession, video.artist, video.title, video.bitrate, video.duration);
            if (deezerCandidate) replaced = await downloadAndReplaceViaDeezer(video, deezerSession, deezerCandidate);
          } catch (err) {
            console.error(`[deezer] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (replaced) {
          // hqFileDownloaded was false going into this pass (the query above
          // filters on it) — an actual replacement is always a genuinely new
          // find, never a re-affirmation of one already known.
          onHqFound?.();
          continue; // downloadAndReplace* already updated every flag/status itself
        }

        if (!slskdCandidate && !jioSaavnCandidate && !deezerCandidate) {
          // Neither source found anything eligible right now — a stable,
          // repeatable verdict, same as the free path below.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() },
          });
          continue;
        }

        // A real upgrade exists (on one source or the other) but
        // downloading/replacing it didn't succeed this time (transient
        // failure, peer/agent unavailable, file never showed up on the
        // shared downloads volume in time — see hqReplace.ts) — flag it as
        // available and leave qualityCheckStatus pending so the next sync
        // retries the download, rather than a one-off failure permanently
        // giving up on it.
        if (!video.betterQualityExists) onHqFound?.(); // wasn't already known before this pass
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: { betterQualityExists: true },
        });
        continue;
      }

      const betterBitrate = await findBetterQualityMp3(video.artist, video.title, video.bitrate);
      if (betterBitrate !== null && !video.betterQualityExists) onHqFound?.(); // wasn't already known before this pass
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
