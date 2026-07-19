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

/**
 * Continuously enriches whatever PlaylistVideo rows are still
 * metadataStatus: 'pending', across every playlist, for the lifetime of the
 * process — deliberately NOT invoked from syncPlaylist/startBackgroundDownload.
 *
 * A backlog of already-downloaded videos from before this feature existed
 * (or just a large library) can run to tens of thousands of rows, which at
 * MusicBrainz's 1 req/sec limit takes hours to drain. If that drain were part
 * of the sync call, it would hold `activeSyncs` the whole time — blocking new
 * video downloads on that playlist and the "Sync Now" button — for hours,
 * even though the actual sync work (diff + download) takes seconds. Running
 * it as its own free-standing loop means sync stays fast regardless of how
 * big the metadata backlog is, and the backlog still drains on its own.
 */
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
              genre: meta.genre, releaseYear: meta.releaseYear, mbRecordingId: meta.mbRecordingId,
              metadataStatus: 'found', metadataFetchedAt: new Date(),
            }
          : { metadataStatus: 'not_found', metadataFetchedAt: new Date() },
      });
    } catch (err) {
      // The video (or its whole playlist) can vanish between the findFirst
      // and this update if the user deletes it mid-lookup — not a real
      // failure, just move on to the next one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      console.error(`[metadata] Failed for ${video.youtubeId}:`, (err as Error).message);
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { metadataStatus: 'error', metadataFetchedAt: new Date() } })
        .catch(() => {});
    }
  }
}
