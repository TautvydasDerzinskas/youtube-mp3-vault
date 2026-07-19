import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { analyzeAudio } from './audioAnalysis';
import { getSharedFilePath } from './downloader';

const IDLE_POLL_MS = 60_000; // nothing pending, or the analysis service is unreachable

let started = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Continuously classifies genre — via local Essentia audio-content analysis,
 * see audioAnalysis.ts — for every downloaded PlaylistVideo still
 * audioAnalysisStatus: 'pending', across every playlist, for the lifetime of
 * the process. Mirrors metadataWorker.ts's shape, but unlike that worker this
 * one needs the actual audio file, so it only ever looks at downloadStatus:
 * 'done' rows, and it never gates on isOnline() — the whole point of moving
 * genre off MusicBrainz is that this works with zero internet connectivity.
 */
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
      // Shouldn't happen (downloadStatus 'done' implies mediaFileId is set) —
      // but don't let a data-integrity edge case wedge the global queue on
      // this one row forever.
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { audioAnalysisStatus: 'error' } })
        .catch(() => {});
      continue;
    }

    try {
      const result = await analyzeAudio(getSharedFilePath(video.mediaFile.filename));
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: result
          ? {
              genre: result.genre,
              audioAnalysisStatus: 'done',
              audioAnalysisFetchedAt: new Date(),
              audioEmbedding: Buffer.from(new Float32Array(result.embedding).buffer),
            }
          : { audioAnalysisStatus: 'error', audioAnalysisFetchedAt: new Date() },
      });
      if (result) {
        console.log(`[audio-analysis] ✓ ${video.youtubeId} — ${result.genre} (${video.title.slice(0, 60)})`);
      } else {
        console.error(`[audio-analysis] ✗ ${video.youtubeId} — analysis failed (${video.title.slice(0, 60)})`);
      }
    } catch (err) {
      // The video (or its whole playlist) can vanish mid-analysis if the user
      // deletes it — not a real failure, just move on to the next one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      // Anything else here is almost always the service being unreachable
      // (opt-in service never enabled, not built/started yet, mid-restart —
      // see docker-compose.yml's audio-analysis profile) rather than
      // something wrong with this specific video. Leave its status as
      // 'pending' and back off, instead of marking every row 'error' the
      // moment the service is briefly (or permanently) down.
      console.error('[audio-analysis] Request failed, will retry:', (err as Error).message);
      await sleep(IDLE_POLL_MS);
    }
  }
}
