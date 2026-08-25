import { prisma } from './prisma';
import { fetchPlaylist } from './youtube';

// Admin-triggered backfill for PlaylistVideo rows created before the
// originalTitle column existed — re-fetches the raw YouTube title for each
// one and writes it back. Only ever invoked via routes/admin.ts's POST
// /backfill-original-titles (Triggers page in the admin UI) — deliberately
// no CLI entry point for this one.
//
// Fetches per PLAYLIST, not per video — the same `--flat-playlist` listing
// fetchPlaylist already uses for a regular sync returns every video's title
// in one yt-dlp call, so a playlist with 50 rows missing originalTitle costs
// exactly 1 request here, not 50. (originalTitle is set from this same
// flat-playlist listing at normal sync time too — see syncService.ts's
// refreshPlaylistFromYoutube — this is just backfilling it for older rows
// that predate the column, using the identical source of truth.)

// A pause between playlist fetches — this is still a burst of extra
// requests against YouTube compared to normal sync traffic, even though
// it's now one request per playlist rather than one per video.
const DELAY_BETWEEN_PLAYLISTS_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface OriginalTitleBackfillSummary {
  filled: number;
  unavailable: number;
  failed: number;
}

export async function runOriginalTitleBackfill(): Promise<OriginalTitleBackfillSummary> {
  // Only a playlist with a real YouTube counterpart can be re-fetched this
  // way — a generated playlist (Playlist.sourcePlaylistId) has no youtubeId
  // to build a listing URL from. playlistGenerator.ts already populates
  // originalTitle at creation time for those anyway, so this should be a
  // rare/empty gap in practice, not something worth a separate per-video
  // fallback for.
  const playlists = await prisma.playlist.findMany({
    where: {
      youtubeId: { not: null },
      videos: { some: { originalTitle: null, downloadStatus: { not: 'removed' } } },
    },
    select: { id: true, youtubeId: true },
  });

  console.log(`[backfill] ${playlists.length} playlist(s) with videos missing originalTitle`);

  let filled = 0;
  let unavailable = 0;
  let failed = 0;

  // Sequential, not parallel — same rate-limiting reasoning as every other
  // yt-dlp-driven pass in this app.
  for (const [index, playlist] of playlists.entries()) {
    if (index > 0) await sleep(DELAY_BETWEEN_PLAYLISTS_MS);

    const missing = await prisma.playlistVideo.findMany({
      where: { playlistId: playlist.id, originalTitle: null, downloadStatus: { not: 'removed' } },
      select: { id: true, youtubeId: true },
    });
    if (missing.length === 0) continue; // could no longer be true by the time this playlist's turn comes up

    let titleById: Map<string, string>;
    try {
      const info = await fetchPlaylist(`https://www.youtube.com/playlist?list=${playlist.youtubeId}`);
      titleById = new Map(info.videos.map(v => [v.id, v.title]));
    } catch (err) {
      console.error(`[backfill] playlist ${playlist.id}: failed to fetch —`, (err as Error).message);
      failed += missing.length;
      continue;
    }

    for (const video of missing) {
      const title = titleById.get(video.youtubeId);
      if (!title) {
        console.warn(`[backfill] ${video.youtubeId}: no longer available in its playlist's current listing — skipping`);
        unavailable++;
        continue;
      }

      try {
        await prisma.playlistVideo.update({ where: { id: video.id }, data: { originalTitle: title } });
        filled++;
      } catch (err) {
        console.error(`[backfill] ${video.youtubeId}: failed to save —`, (err as Error).message);
        failed++;
      }
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
