import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { lookupTrackMetadata } from './musicbrainz';

const IDLE_POLL_MS = 60_000;   // nothing pending right now — check back in a minute
const OFFLINE_POLL_MS = 30_000; // no internet — check back sooner, this is cheap

let started = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function startMetadataWorker(): void {
  if (started) return;
  started = true;
  void loop();
}

async function loop(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!isOnline()) {
      await sleep(OFFLINE_POLL_MS);
      continue;
    }

    const video = await prisma.playlistVideo.findFirst({
      where: { metadataStatus: 'pending', downloadStatus: { not: 'removed' } },
      orderBy: { addedAt: 'asc' },
    });

    if (!video) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    try {
      const meta = await lookupTrackMetadata(video.title, video.channelName);
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: meta
          ? {
              artist: meta.artist, album: meta.album, trackNumber: meta.trackNumber,
              releaseYear: meta.releaseYear, mbRecordingId: meta.mbRecordingId,
              metadataStatus: 'found', metadataFetchedAt: new Date(),
            }
          : { metadataStatus: 'not_found', metadataFetchedAt: new Date() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      console.error(`[metadata] Failed for ${video.youtubeId}:`, (err as Error).message);
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { metadataStatus: 'error', metadataFetchedAt: new Date() } })
        .catch(() => {});
    }
  }
}
