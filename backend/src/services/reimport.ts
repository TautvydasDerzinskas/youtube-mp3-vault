import { prisma } from './prisma';
import { refreshPlaylistFromYoutube, tryClaimSync, releaseSyncClaim } from './syncService';
import { resolvePlaylistMetadata } from './metadataWorker';
import { writeTrackTags } from './id3Tags';

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

// Admin-triggered "rebuild ID3 tags" — the narrow sibling of soft reimport
// above: writes each already-downloaded video's *current* DB metadata
// (title/artist/album/track/year/genre) into its mp3's ID3 tags, with no
// network activity at all — no YouTube reconciliation, no MusicBrainz
// rematch, no audio re-analysis. Useful on its own after, say, a
// tag-writing bug fix or a manual metadata correction, where a full soft
// reimport would be unnecessary network/API load for something that's
// really just "re-apply what's already in the database."
export function startTagRebuild(playlistId: string): boolean {
  if (!tryClaimSync(playlistId)) return false;

  rebuildPlaylistTags(playlistId).finally(() => releaseSyncClaim(playlistId));
  return true;
}

async function rebuildPlaylistTags(playlistId: string): Promise<void> {
  try {
    await prisma.playlist.update({
      where: { id: playlistId },
      data: { syncStatus: 'syncing' },
    });

    const videos = await prisma.playlistVideo.findMany({
      where: { playlistId, downloadStatus: 'done' },
      include: { mediaFile: true },
    });

    for (const video of videos) {
      if (!video.mediaFile) continue;
      writeTrackTags(video.mediaFile.filename, {
        title: video.title, artist: video.artist, album: video.album,
        trackNumber: video.trackNumber, releaseYear: video.releaseYear, genres: video.genres,
      });
    }

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { syncStatus: 'idle' },
    });
  } catch (err) {
    console.error(`[reimport] Error rebuilding tags for playlist ${playlistId}:`, err);
    await prisma.playlist
      .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
      .catch(() => {});
  }
}
