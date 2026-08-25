import { prisma } from './prisma';
import { runYtDlp, potProviderExtractorArgs } from './ytdlpProcess';

// Admin-triggered backfill for PlaylistVideo rows created before the
// originalTitle column existed — re-fetches each one's raw YouTube title via
// a metadata-only yt-dlp call (no download) and writes it back. Only ever
// invoked via routes/admin.ts's POST /backfill-original-titles (Triggers
// page in the admin UI) — deliberately no CLI entry point for this one.

// Single-video metadata call, not a whole playlist — 60s is generous even
// accounting for a slow bot-check standoff (see ytdlpProcess.ts's own
// rationale for why every yt-dlp call needs a hard ceiling at all).
const FETCH_TIMEOUT_MS = 60_000;
// A deliberate pause between requests — this is a burst of individual
// per-video lookups against YouTube in a way normal sync traffic never is,
// and going too fast risks tripping bot-protection for the rest of the
// app's own yt-dlp calls, not just this job.
const DELAY_BETWEEN_REQUESTS_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTitle(youtubeId: string): Promise<string | null> {
  const args = [
    '--skip-download',
    '--dump-json',
    '--no-warnings',
    '--ignore-errors',
    '--extractor-args', 'youtube:player_client=default,android,-tv',
    ...potProviderExtractorArgs(),
    `https://www.youtube.com/watch?v=${youtubeId}`,
  ];

  const { code, stdout } = await runYtDlp(args, FETCH_TIMEOUT_MS);
  if (code !== 0 || !stdout.trim()) return null;

  try {
    const info = JSON.parse(stdout.trim().split('\n')[0]);
    return typeof info.title === 'string' && info.title ? info.title : null;
  } catch {
    return null;
  }
}

export interface OriginalTitleBackfillSummary {
  filled: number;
  unavailable: number;
  failed: number;
}

export async function runOriginalTitleBackfill(): Promise<OriginalTitleBackfillSummary> {
  const videos = await prisma.playlistVideo.findMany({
    where: { originalTitle: null, downloadStatus: { not: 'removed' } },
    select: { id: true, youtubeId: true },
  });

  console.log(`[backfill] ${videos.length} video(s) missing originalTitle`);

  let filled = 0;
  let unavailable = 0;
  let failed = 0;

  // Sequential, not parallel — this is already a burst of extra per-video
  // requests against YouTube (see DELAY_BETWEEN_REQUESTS_MS above); running
  // them concurrently would only make that worse for no real benefit, since
  // this is a one-time cleanup pass, not something latency-sensitive.
  for (const [index, video] of videos.entries()) {
    if (index > 0) await sleep(DELAY_BETWEEN_REQUESTS_MS);

    try {
      const title = await fetchTitle(video.youtubeId);
      if (!title) {
        console.warn(`[backfill] ${video.youtubeId}: no longer available on YouTube — skipping`);
        unavailable++;
        continue;
      }

      console.log(`[backfill] ${video.youtubeId}: "${title}"`);
      await prisma.playlistVideo.update({ where: { id: video.id }, data: { originalTitle: title } });
      filled++;
    } catch (err) {
      console.error(`[backfill] ${video.youtubeId}: failed —`, (err as Error).message);
      failed++;
    }
  }

  console.log(`[backfill] Done. filled=${filled} unavailable=${unavailable} failed=${failed}`);
  return { filled, unavailable, failed };
}

// Guarded by a single module-level flag rather than reimport.ts's
// per-playlist activeSyncs Set — this job isn't scoped to one playlist, so
// only one pass can run at a time, system-wide.
let running = false;

export function startOriginalTitleBackfill(): boolean {
  if (running) return false;
  running = true;
  runOriginalTitleBackfill()
    .catch((err) => console.error('[backfill] Fatal error:', err))
    .finally(() => { running = false; });
  return true;
}
