import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { findBetterQualityMp3, MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { isHqAutoDownloadEnabled } from './settings';
import { findExactMatchCandidate, downloadAndReplace, downloadAndReplaceFromQobuz } from './hqReplace';

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
// outright, not just flagged as available. That path in particular can take
// a while per video (a real slskd search plus, when a match is found, an
// actual file transfer) — onProgress (only syncService.ts's
// downloadPendingVideos passes one) reports this video's 1-indexed position
// and running total before each one is processed, so the caller can surface
// live progress instead of this looking indistinguishable from stuck.
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

  // Qobuz is opt-in per playlist owner (see User.qobuzHqEnabled) — its
  // verification step needs a real human occasionally (see
  // services/qobuz/session.ts), so it's never attempted for a user who
  // hasn't turned it on. Looked up once per playlist, not per video.
  const playlistOwner = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { user: { select: { qobuzHqEnabled: true } } },
  });
  const qobuzEnabledForOwner = playlistOwner?.user.qobuzHqEnabled ?? false;

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
        const candidate = await findExactMatchCandidate(video.artist, video.title, video.bitrate, video.duration);
        if (candidate) {
          const replaced = await downloadAndReplace(video, candidate);
          if (replaced) continue; // downloadAndReplace already updated every flag/status itself

          // A real upgrade exists but downloading/replacing it didn't succeed
          // this time (transient failure, peer/agent unavailable, file never
          // showed up on the shared downloads volume in time — see
          // hqReplace.ts) — flag it as available and leave qualityCheckStatus
          // pending so the next sync retries the download, rather than a
          // one-off failure permanently giving up on it.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { betterQualityExists: true },
          });
          continue;
        }

        // Soulseek found nothing — Qobuz is a fallback source, not a second
        // competing search: only tried once slskd comes up empty, since it
        // has no per-file text/duration matching of its own the way slskd's
        // MATCH_TIERS do — its own search is either one confident hit or
        // nothing (see hqReplace.ts's downloadAndReplaceFromQobuz). Also
        // opt-in per playlist owner — see qobuzEnabledForOwner above.
        if (qobuzEnabledForOwner) {
          try {
            // Rebuilt as a fresh object (rather than passing `video` as-is) so
            // TS's narrowing of `video.artist` from the `!video.artist` check
            // above actually applies — it doesn't propagate to `video`'s own
            // static type when the whole object is passed by reference.
            const replacedFromQobuz = await downloadAndReplaceFromQobuz({
              id: video.id, youtubeId: video.youtubeId, mediaFileId: video.mediaFileId,
              artist: video.artist, title: video.title,
            });
            if (replacedFromQobuz) continue;
          } catch (err) {
            // Includes verification itself not being complete yet — that now
            // needs a real user to click through a popup (see
            // ensureCommunitySession/session.ts), so this is just another
            // "nothing available this time" outcome to retry next sync.
            console.error(`[qobuz] HQ fallback failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        // Neither source found/delivered anything eligible right now — a
        // stable, repeatable verdict, same as the free path below.
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() },
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
