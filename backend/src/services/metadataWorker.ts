import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { lookupTrackMetadata, deriveFallbackMetadata } from './musicbrainz';
import { getTrackCorrection } from './lastfm';

const IDLE_POLL_MS = 60_000;   // nothing pending right now — check back in a minute
const OFFLINE_POLL_MS = 30_000; // no internet — check back sooner, this is cheap

let started = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Three-tier fallback once MusicBrainz has no match: local heuristic parse
// first, then — if that produced an artist to work with — ask Last.fm to
// correct/canonicalize it. A Last.fm correction is trusted as-is (like a
// MusicBrainz match would be), since it comes from a real catalog rather
// than our regex guess; only the untouched heuristic result gets title-cased,
// since that's the only tier without an authoritative source for casing.
async function resolveFallbackMetadata(title: string, channelName: string | null): Promise<{ artist: string | null; title: string }> {
  const local = deriveFallbackMetadata(title, channelName);
  if (!local.artist) return local;

  const corrected = await getTrackCorrection(local.artist, local.title);
  return corrected ?? local;
}

export function startMetadataWorker(): void {
  if (started) return;
  started = true;
  void loop();
}

async function loop(): Promise<void> {
  // Videos already marked 'not_found' from a previous server run get one
  // local-fallback backfill pass below. Gating on this boot-time cutoff
  // (rather than e.g. `artist: null`) guarantees each such row is only
  // reprocessed once per run, even if the fallback parser can't extract an
  // artist from it either — otherwise a row that stays artist-less forever
  // would keep matching the query and starve the rest of the queue.
  const backfillCutoff = new Date();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!isOnline()) {
      await sleep(OFFLINE_POLL_MS);
      continue;
    }

    const video = await prisma.playlistVideo.findFirst({
      where: {
        downloadStatus: { not: 'removed' },
        OR: [
          { metadataStatus: 'pending' },
          { metadataStatus: 'not_found', metadataFetchedAt: { lt: backfillCutoff } },
        ],
      },
      orderBy: { addedAt: 'asc' },
    });

    if (!video) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    try {
      if (video.metadataStatus === 'not_found') {
        // Already tried MusicBrainz once — re-querying it wouldn't find
        // anything new, so just run the local parser + Last.fm correction.
        const fallback = await resolveFallbackMetadata(video.title, video.channelName);
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: { artist: fallback.artist, title: fallback.title, metadataFetchedAt: new Date() },
        });
        continue;
      }

      const meta = await lookupTrackMetadata(video.title, video.channelName);
      if (meta) {
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: {
            artist: meta.artist, album: meta.album, trackNumber: meta.trackNumber,
            releaseYear: meta.releaseYear, mbRecordingId: meta.mbRecordingId,
            metadataStatus: 'found', metadataFetchedAt: new Date(),
          },
        });
      } else {
        const fallback = await resolveFallbackMetadata(video.title, video.channelName);
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: { artist: fallback.artist, title: fallback.title, metadataStatus: 'not_found', metadataFetchedAt: new Date() },
        });
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      console.error(`[metadata] Failed for ${video.youtubeId}:`, (err as Error).message);
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { metadataStatus: 'error', metadataFetchedAt: new Date() } })
        .catch(() => {});
    }
  }
}
