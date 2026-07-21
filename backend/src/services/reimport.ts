import { prisma } from './prisma';
import { refreshPlaylistFromYoutube, tryClaimSync, releaseSyncClaim } from './syncService';
import { resolvePlaylistMetadata } from './metadataWorker';

// Admin-triggered "soft reimport" — re-syncs metadata, re-triggers audio
// analysis (genres included, since those come from that pass), and picks up
// any brand-new videos, but never downloads, deletes, or replaces an mp3:
// existing files are reused as-is, always. Two things make that guarantee
// hold: the download loop (_downloadPending) simply isn't part of this code
// path at all, and refreshPlaylistFromYoutube is called with skipRemoval so
// its "mark missing videos removed" step — the one that clears mediaFileId
// and GC-deletes the shared file — never runs either.
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

    // 1. Reconcile against YouTube — but with skipRemoval, unlike a regular
    // sync's first step: this action's whole premise is "existing files are
    // reused as-is," so it must never mark a video removed or GC-delete its
    // file, even if that video genuinely isn't in the source playlist
    // anymore. Any brand-new videos are still inserted as `pending` (that
    // part's non-destructive), but since this flow never calls
    // _downloadPending, they're left for the next real sync (cron or
    // manual) to actually download. Skipped entirely for a generated
    // playlist — it has no real YouTube playlist to reconcile against, so
    // this just re-runs the metadata/audio-analysis passes on what's there.
    if (!playlist.sourcePlaylistId) {
      await refreshPlaylistFromYoutube(playlistId, { skipRemoval: true });
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
