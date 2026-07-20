import { prisma } from './prisma';
import { refreshPlaylistFromYoutube, tryClaimSync, releaseSyncClaim } from './syncService';
import { resolvePlaylistMetadata } from './metadataWorker';

// Admin-triggered "soft reimport" — re-runs everything a first sync would do
// EXCEPT downloading mp3s; existing files are reused as-is. This is a
// deliberately separate flow from syncPlaylist/_downloadPending rather than
// a flag threaded through them: it reuses their reconciliation step
// (refreshPlaylistFromYoutube) and the metadata pipeline (in force mode),
// but the download loop itself simply isn't part of this code path, so
// there's no risk of a stray condition ever triggering a download here.
//
// Returns false without doing anything if the playlist is already busy
// (a regular sync, a retry, or another reimport already in progress).
export function startSoftReimport(playlistId: string): boolean {
  if (!tryClaimSync(playlistId)) return false;

  softReimportPlaylist(playlistId).finally(() => releaseSyncClaim(playlistId));
  return true;
}

async function softReimportPlaylist(playlistId: string): Promise<void> {
  try {
    const playlist = await prisma.playlist.findUniqueOrThrow({
      where: { id: playlistId },
      select: { sourcePlaylistId: true },
    });

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { syncStatus: 'syncing' },
    });

    // 1. Reconcile against YouTube — identical to a regular sync's first
    // step. Any brand-new videos are inserted as `pending`, but since this
    // flow never calls _downloadPending, they're left for the next real
    // sync (cron or manual) to actually download. Skipped for a generated
    // playlist — it has no real YouTube playlist to reconcile against, so
    // this just re-runs the metadata/audio-analysis passes on what's there.
    if (!playlist.sourcePlaylistId) {
      await refreshPlaylistFromYoutube(playlistId);
    }

    // 2. Re-run metadata resolution for every video in the playlist,
    // regardless of its current status — the "hard force rematch" this
    // admin action exists for.
    await resolvePlaylistMetadata(playlistId, { force: true });

    // 3. Queue every already-downloaded video for re-analysis. The existing
    // audioAnalysisWorker picks these up on its own using the file already
    // on disk — no new analysis logic needed here, just resetting the flag.
    await prisma.playlistVideo.updateMany({
      where: { playlistId, downloadStatus: 'done' },
      data: { audioAnalysisStatus: 'pending' },
    });

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { syncStatus: 'idle', lastSyncedAt: new Date() },
    });
  } catch (err) {
    console.error(`[reimport] Error soft-reimporting playlist ${playlistId}:`, err);
    await prisma.playlist
      .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
      .catch(() => {});
  }
}
