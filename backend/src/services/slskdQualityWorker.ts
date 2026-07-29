import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { findBetterQualityMp3 } from './slskd';
import { isHqAutoDownloadEnabled } from './settings';
import { findExactMatchCandidate, downloadAndReplace } from './hqReplace';

// Checks slskd for a better-quality mp3 of each downloaded video in this
// playlist still awaiting a first check. Called at the end of a playlist's
// download pass (see downloadPendingVideos in syncService.ts), same as
// resolvePlaylistMetadata right before it — deliberately after metadata
// resolution, not before, so `video.artist` is already populated by whatever
// MusicBrainz/the local fallback found for it by the time this runs.
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
  options: { onProgress?: (current: number, total: number, title: string) => void } = {}
): Promise<void> {
  const { onProgress } = options;
  const videos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: 'done', qualityCheckStatus: 'pending' },
    orderBy: { position: 'asc' },
  });

  for (const [index, video] of videos.entries()) {
    if (!isOnline()) return;
    onProgress?.(index + 1, videos.length, video.artist ? `${video.artist} - ${video.title}` : video.title);

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
        if (!candidate) {
          // Search+match concluded there's nothing eligible right now — a
          // stable, repeatable verdict, same as the free path below.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() },
          });
          continue;
        }

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
