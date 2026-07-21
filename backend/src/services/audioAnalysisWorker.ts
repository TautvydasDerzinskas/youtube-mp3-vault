import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { analyzeAudio } from './audioAnalysis';
import { getSharedFilePath } from './downloader';
import { removePlaylistVideo } from './syncService';
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

// Null when this video's playlist isn't a generated one — both of the
// checks below (Non-Music, audio duplicate) only ever apply to generated
// playlists, per source's own comment.
async function getGeneratedPlaylistSourceId(playlistId: string): Promise<string | null> {
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { sourcePlaylistId: true },
  });
  return playlist?.sourcePlaylistId ?? null;
}

// The genre classifier can, correctly, decide a candidate isn't music at all
// (spoken word, ASMR, sound effects, a podcast clip that matched a search
// query, …) — real audio-content analysis is a much stronger signal for
// this than anything in the title/metadata pipeline, so for a generated
// playlist specifically we trust it outright.
function isNonMusic(genres: string[]): boolean {
  // Case-insensitive — the exact label casing comes from a model file
  // fetched from essentia.upf.edu at Docker build time (not vendored/pinned
  // in this repo), so don't rely on it matching a hardcoded casing exactly.
  return genres.some((g) => g.toLowerCase() === 'non-music');
}

// Checks a freshly-computed embedding against the source playlist's tracks
// and whatever's already been analyzed in this same generated playlist.
// Both sides are already-downloaded, already-analyzed tracks, so this costs
// nothing extra beyond the analysis that just ran anyway (no new downloads).
async function isAudioDuplicate(video: { id: string; playlistId: string }, sourcePlaylistId: string, embedding: Float32Array): Promise<boolean> {
  const others = await prisma.playlistVideo.findMany({
    where: {
      audioEmbedding: { not: null },
      OR: [
        { playlistId: sourcePlaylistId },
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

        const sourcePlaylistId = await getGeneratedPlaylistSourceId(video.playlistId);
        if (sourcePlaylistId) {
          let dropReason: string | null = null;
          if (isNonMusic(genres)) {
            dropReason = 'tagged Non-Music';
          } else if (embeddingBuffer && await isAudioDuplicate(video, sourcePlaylistId, bufferToFloat32Array(embeddingBuffer))) {
            dropReason = 'audio duplicate of an existing track';
          }
          if (dropReason) {
            console.log(`[audio-analysis] Dropping ${video.youtubeId} — ${dropReason} (${video.title.slice(0, 60)})`);
            await removePlaylistVideo(video.id, video.mediaFileId).catch(() => {});
          }
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
