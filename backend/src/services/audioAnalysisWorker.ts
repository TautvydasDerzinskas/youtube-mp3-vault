import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { analyzeAudio } from './audioAnalysis';
import { getSharedFilePath } from './downloader';
import { removeDuplicateVideo } from './syncService';
import { bufferToFloat32Array, cosineSimilarity } from './embeddings';

const IDLE_POLL_MS = 60_000; // nothing pending, or the analysis service is unreachable

// Conservative — this is a genre/style-classification embedding
// (discogs-effnet, mean-pooled over the whole track), not a purpose-built
// audio fingerprint, so two different-but-similar-sounding tracks in a tight
// genre could score deceptively close. Only flag a duplicate when tracks are
// near-identical in this space, since a false positive here silently drops
// a legitimately different song from a generated playlist.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.97;

let started = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Only meaningful for a generated ("similar playlist") video — checks its
// freshly-computed embedding against the source playlist's tracks and
// whatever's already been analyzed in this same generated playlist. Both
// sides are already-downloaded, already-analyzed tracks, so this costs
// nothing extra beyond the analysis that just ran anyway (no new downloads).
async function isAudioDuplicate(video: { id: string; playlistId: string }, embedding: Float32Array): Promise<boolean> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: video.playlistId },
    select: { sourcePlaylistId: true },
  });
  if (!playlist?.sourcePlaylistId) return false;

  const others = await prisma.playlistVideo.findMany({
    where: {
      audioEmbedding: { not: null },
      OR: [
        { playlistId: playlist.sourcePlaylistId },
        { playlistId: video.playlistId, id: { not: video.id } },
      ],
    },
    select: { audioEmbedding: true },
  });

  return others.some((o) => {
    if (!o.audioEmbedding) return false;
    return cosineSimilarity(embedding, bufferToFloat32Array(o.audioEmbedding)) >= DUPLICATE_SIMILARITY_THRESHOLD;
  });
}

export function startAudioAnalysisWorker(): void {
  if (started) return;
  started = true;
  void loop();
}

async function loop(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const video = await prisma.playlistVideo.findFirst({
      where: { audioAnalysisStatus: 'pending', downloadStatus: 'done' },
      orderBy: { addedAt: 'asc' },
      include: { mediaFile: true },
    });

    if (!video) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    if (!video.mediaFile) {
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { audioAnalysisStatus: 'error' } })
        .catch(() => {});
      continue;
    }

    try {
      const result = await analyzeAudio(getSharedFilePath(video.mediaFile.filename));
      const genres = result ? result.genres.map(capitalizeFirst) : [];
      const embeddingBuffer = result ? Buffer.from(new Float32Array(result.embedding).buffer) : null;
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: result
          ? {
              genres,
              audioAnalysisStatus: 'done',
              audioAnalysisFetchedAt: new Date(),
              audioEmbedding: embeddingBuffer,
            }
          : { audioAnalysisStatus: 'error', audioAnalysisFetchedAt: new Date() },
      });
      if (result) {
        console.log(`[audio-analysis] ✓ ${video.youtubeId} — ${genres.join(', ')} (${video.title.slice(0, 60)})`);

        if (embeddingBuffer && await isAudioDuplicate(video, bufferToFloat32Array(embeddingBuffer))) {
          console.log(`[audio-analysis] Dropping ${video.youtubeId} — audio duplicate of an existing track (${video.title.slice(0, 60)})`);
          await removeDuplicateVideo(video.id, video.mediaFileId).catch(() => {});
        }
      } else {
        console.error(`[audio-analysis] ✗ ${video.youtubeId} — analysis failed (${video.title.slice(0, 60)})`);
      }
    } catch (err) {
      // The video (or its whole playlist) can vanish mid-analysis if the user
      // deletes it — not a real failure, just move on to the next one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      console.error('[audio-analysis] Request failed, will retry:', (err as Error).message);
      await sleep(IDLE_POLL_MS);
    }
  }
}
