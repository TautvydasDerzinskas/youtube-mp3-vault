import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { analyzeAudio } from './audioAnalysis';
import { getSharedFilePath } from './downloader';

const IDLE_POLL_MS = 60_000; // nothing pending, or the analysis service is unreachable

let started = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: result
          ? {
              genres,
              audioAnalysisStatus: 'done',
              audioAnalysisFetchedAt: new Date(),
              audioEmbedding: Buffer.from(new Float32Array(result.embedding).buffer),
            }
          : { audioAnalysisStatus: 'error', audioAnalysisFetchedAt: new Date() },
      });
      if (result) {
        console.log(`[audio-analysis] ✓ ${video.youtubeId} — ${genres.join(', ')} (${video.title.slice(0, 60)})`);
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
