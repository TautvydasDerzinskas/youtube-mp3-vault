import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { fetchPlaylist } from './youtube';
import { downloadVideo, publishToSharedStore, removeSharedFile, isPermanentlyUnavailable } from './downloader';
import { resolvePlaylistMetadata } from './metadataWorker';

/** True for a Prisma unique-constraint violation (P2002) — i.e. we lost a create race. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** True for a Prisma FK-restrict violation (P2003) — i.e. some other row still references it. */
function isForeignKeyRestrictViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

async function resolveMediaFile(youtubeId: string) {
  const existing = await prisma.mediaFile.findUnique({ where: { youtubeId } });
  if (existing) return existing;

  const { tempFilePath, fileSize, sourceBitrateKbps } = await downloadVideo(youtubeId);
  const filename = `${youtubeId}.mp3`;
  await publishToSharedStore(tempFilePath, filename);

  try {
    return await prisma.mediaFile.create({
      data: { youtubeId, filename, fileSize, bitrate: sourceBitrateKbps },
    });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
    return await prisma.mediaFile.findUniqueOrThrow({ where: { youtubeId } });
  }
}

async function tryDeleteMediaFile(mediaFileId: string): Promise<void> {
  let mediaFile;
  try {
    mediaFile = await prisma.mediaFile.delete({ where: { id: mediaFileId } });
  } catch (err) {
    if (isForeignKeyRestrictViolation(err)) return; // still referenced elsewhere — leave it
    throw err;
  }
  await removeSharedFile(mediaFile.filename);
}

// In-memory guard — prevents concurrent syncs on the same playlist
const activeSyncs = new Set<string>();

export function isSyncing(playlistId: string): boolean {
  return activeSyncs.has(playlistId);
}

// Claims the same busy-slot regular syncing uses, for callers outside this
// file (see reimport.ts) that need to touch a playlist's videos without
// racing a real sync — or another such caller — on the same playlist.
// Returns false if it was already claimed.
export function tryClaimSync(playlistId: string): boolean {
  if (activeSyncs.has(playlistId)) return false;
  activeSyncs.add(playlistId);
  return true;
}

export function releaseSyncClaim(playlistId: string): void {
  activeSyncs.delete(playlistId);
}

export async function resetStuckSyncs(): Promise<void> {
  const [playlists, videos] = await Promise.all([
    prisma.playlist.updateMany({
      where: { syncStatus: 'syncing' },
      data: { syncStatus: 'idle' },
    }),
    prisma.playlistVideo.updateMany({
      where: { downloadStatus: 'downloading' },
      data: { downloadStatus: 'pending' },
    }),
  ]);
  if (playlists.count > 0 || videos.count > 0) {
    console.log(
      `[sync] Reset ${playlists.count} stuck playlist(s) and ${videos.count} stuck video(s)`
    );
  }
}

// Fetches the current video list from YouTube and reconciles it against the
// DB: marks videos no longer in the playlist as removed, inserts brand-new
// ones as `pending`, and refreshes the playlist's own title/thumbnail/count.
// Shared by the regular sync flow and the admin-triggered soft reimport —
// both need identical reconciliation, just followed by different next steps.
export async function refreshPlaylistFromYoutube(playlistId: string): Promise<void> {
  const playlist = await prisma.playlist.findUniqueOrThrow({
    where: { id: playlistId },
    select: { id: true, youtubeId: true },
  });
  if (!playlist.youtubeId) {
    // Generated playlists have no real YouTube counterpart to refresh from —
    // this should never actually be reachable for one (see syncAllPlaylists'
    // filter and Actions.tsx hiding Sync), but fail loudly rather than
    // silently building a broken fetch URL if it ever is.
    throw new Error(`Playlist ${playlistId} has no youtubeId — cannot sync a generated playlist`);
  }

  // ── 1. Fetch current video list ────────────────────────────────────────────
  const info = await fetchPlaylist(
    `https://www.youtube.com/playlist?list=${playlist.youtubeId}`
  );
  const freshIds = new Set(info.videos.map((v) => v.id));

  // ── 2. Current DB videos (non-removed) ────────────────────────────────────
  const dbVideos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: { not: 'removed' } },
    select: { id: true, youtubeId: true, mediaFileId: true },
  });
  const dbIds = new Set(dbVideos.map((v) => v.youtubeId));

  // Safety net beyond fetchPlaylist's own exit-code check — a yt-dlp/YouTube
  // hiccup could still return a truncated-but-successful (0 exit code)
  // listing. A real playlist losing more than half its videos in one sync is
  // implausible; a partial fetch is far more likely. Refuse to touch
  // anything rather than risk deleting downloaded files for videos that are
  // still actually in the playlist.
  const droppedCount = dbVideos.filter((v) => !freshIds.has(v.youtubeId)).length;
  if (dbVideos.length >= 20 && droppedCount > dbVideos.length * 0.5) {
    throw new Error(
      `Refusing to sync playlist ${playlistId}: fetch returned ${info.videos.length} videos vs ${dbVideos.length} ` +
      `already known (would remove ${droppedCount}) — this looks like a partial/failed fetch, not a real change.`
    );
  }

  // ── 3. Remove videos no longer in the playlist ────────────────────────────
  for (const dbVideo of dbVideos) {
    if (!freshIds.has(dbVideo.youtubeId)) {
      await prisma.playlistVideo.update({
        where: { id: dbVideo.id },
        data: { downloadStatus: 'removed', mediaFileId: null, fileSize: null, bitrate: null },
      });
      // Break this row's reference before trying to GC the shared file —
      // it only actually deletes once no other playlist_video points at it.
      if (dbVideo.mediaFileId) {
        await tryDeleteMediaFile(dbVideo.mediaFileId);
      }
    }
  }

  // ── 3b. Restore any previously-removed video that's reappeared ───────────
  // A video wrongly marked removed by a past bad sync (or genuinely re-added
  // to the YouTube playlist) would otherwise stay stuck as "removed"
  // forever — the queries above only ever look at non-removed rows, and
  // step 4's createMany silently no-ops on it below (a row with this
  // playlistId+youtubeId already exists). Its media file is already gone by
  // this point, so this just clears the way for a fresh download.
  const removedVideos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: 'removed' },
    select: { id: true, youtubeId: true },
  });
  for (const removedVideo of removedVideos) {
    const fresh = info.videos.find((v) => v.id === removedVideo.youtubeId);
    if (!fresh) continue;
    await prisma.playlistVideo.update({
      where: { id: removedVideo.id },
      data: { downloadStatus: 'pending', downloadError: null, position: fresh.position, isAvailable: true },
    });
  }

  // ── 4. Add new videos ─────────────────────────────────────────────────────
  const newVideos = info.videos.filter((v) => !dbIds.has(v.id));
  if (newVideos.length > 0) {
    await prisma.playlistVideo.createMany({
      data: newVideos.map((v) => ({
        playlistId,
        youtubeId: v.id,
        title: v.title,
        originalTitle: v.title,
        duration: v.duration,
        thumbnailUrl: v.thumbnailUrl,
        position: v.position,
        isAvailable: v.isAvailable,
        channelName: v.channelName,
        downloadStatus: 'pending',
      })),
      skipDuplicates: true,
    });
  }

  // ── 5. Update playlist metadata ───────────────────────────────────────────
  await prisma.playlist.update({
    where: { id: playlistId },
    data: { title: info.title, thumbnailUrl: info.thumbnailUrl, videoCount: info.videos.length },
  });
}

// Exported (not just used internally) so the admin soft-reimport and
// playlist-generation flows can await the same download-then-metadata pass
// directly, instead of going through the fire-and-forget
// startBackgroundDownload wrapper meant for HTTP handlers that can't block.
export async function downloadPendingVideos(playlistId: string): Promise<void> {
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = await prisma.playlist.findUnique({
        where: { id: playlistId },
        select: { syncPaused: true },
      });
      if (!current || current.syncPaused) break;

      const video = await prisma.playlistVideo.findFirst({
        where: { playlistId, downloadStatus: 'pending', isAvailable: true },
        orderBy: { position: 'asc' },
      });
      if (!video) break;

      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: { downloadStatus: 'downloading' },
      });

      try {
        const mediaFile = await resolveMediaFile(video.youtubeId);
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: {
            downloadStatus: 'done',
            mediaFileId: mediaFile.id,
            fileSize: mediaFile.fileSize,
            bitrate: mediaFile.bitrate,
            downloadError: null,
          },
        });
        console.log(`[sync] ✓ ${video.youtubeId} — ${video.title.slice(0, 60)}`);
      } catch (err) {
        const message = (err as Error).message;
        console.error(`[sync] ✗ ${video.youtubeId}:`, message);
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: isPermanentlyUnavailable(message)
            ? { downloadStatus: 'failed', downloadError: message.slice(0, 500), isAvailable: false }
            : { downloadStatus: 'failed', downloadError: message.slice(0, 500) },
        });
      }
    }

    // Downloads are done — resolve metadata for whatever's still pending in
    // this playlist as the last step of the same sync pass.
    await resolvePlaylistMetadata(playlistId);

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { syncStatus: 'idle', lastSyncedAt: new Date() },
    });
  } catch (err) {
    console.error(`[sync] Fatal error for playlist ${playlistId}:`, err);
    await prisma.playlist
      .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
      .catch(() => {});
  }
}

export function startBackgroundDownload(playlistId: string): void {
  if (activeSyncs.has(playlistId)) return;
  activeSyncs.add(playlistId);
  downloadPendingVideos(playlistId).finally(() => activeSyncs.delete(playlistId));
}

export async function syncPlaylist(playlistId: string): Promise<void> {
  if (activeSyncs.has(playlistId)) {
    console.log(`[sync] ${playlistId} already syncing — skipped`);
    return;
  }
  activeSyncs.add(playlistId);

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true },
  });
  if (!playlist) {
    activeSyncs.delete(playlistId);
    return;
  }

  await prisma.playlist.update({
    where: { id: playlistId },
    data: { syncStatus: 'syncing' },
  });

  try {
    await refreshPlaylistFromYoutube(playlistId);
    await downloadPendingVideos(playlistId);
    // downloadPendingVideos sets syncStatus → idle / error

  } catch (err) {
    console.error(`[sync] Error syncing playlist ${playlistId}:`, err);
    await prisma.playlist
      .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
      .catch(() => {});
  } finally {
    activeSyncs.delete(playlistId);
  }
}

export function retryFailedVideos(playlistId: string): void {
  if (activeSyncs.has(playlistId)) return;
  activeSyncs.add(playlistId);

  (async () => {
    try {
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { syncStatus: 'syncing' },
      });
      await prisma.playlistVideo.updateMany({
        where: { playlistId, downloadStatus: 'failed', isAvailable: true },
        data: { downloadStatus: 'pending', downloadError: null },
      });
      await downloadPendingVideos(playlistId);
      // downloadPendingVideos sets syncStatus → idle / error
    } catch (err) {
      console.error(`[sync] Error retrying failed videos for playlist ${playlistId}:`, err);
      await prisma.playlist
        .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
        .catch(() => {});
    } finally {
      activeSyncs.delete(playlistId);
    }
  })();
}

export async function syncAllPlaylists(): Promise<void> {
  const playlists = await prisma.playlist.findMany({
    select: { id: true },
    // Generated playlists (youtubeId null) have no real playlist to sync
    // against — syncPlaylist would just error out on them.
    where: { syncStatus: { not: 'syncing' }, syncPaused: false, youtubeId: { not: null } },
  });
  console.log(`[scheduler] Syncing ${playlists.length} playlist(s)`);
  for (const { id } of playlists) {
    try {
      await syncPlaylist(id);
    } catch (err) {
      console.error(`[scheduler] Failed playlist ${id}:`, err);
    }
  }
}

export async function setSyncPaused(playlistId: string, paused: boolean) {
  return prisma.playlist.update({
    where: { id: playlistId },
    data: { syncPaused: paused },
  });
}

export async function cleanupMediaFiles(mediaFileIds: string[]): Promise<void> {
  for (const id of mediaFileIds) {
    await tryDeleteMediaFile(id);
  }
}

// Deletes a single playlist_video row outright (not the soft "removed"
// status a real resync uses), keeping playlist.videoCount and the shared
// media file store consistent. Used for two cases where the row was never a
// deliberate addition from the user's perspective: the audio-analysis dedup
// check for generated playlists (see audioAnalysisWorker.ts), and dropping a
// generated playlist's failed downloads after its initial build (see
// playlistGenerator.ts) — a generated playlist never gets a normal resync to
// retry/clean those up otherwise.
export async function removePlaylistVideo(playlistVideoId: string, mediaFileId: string | null): Promise<void> {
  const video = await prisma.playlistVideo.delete({ where: { id: playlistVideoId } });
  await prisma.playlist.update({
    where: { id: video.playlistId },
    data: { videoCount: { decrement: 1 } },
  });
  if (mediaFileId) {
    await tryDeleteMediaFile(mediaFileId);
  }
}

/** Distinct MediaFile ids currently used by a playlist's downloaded videos — snapshot before deleting the playlist. */
export async function mediaFilesUsedBy(playlistId: string): Promise<string[]> {
  const videos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: 'done', mediaFileId: { not: null } },
    select: { mediaFileId: true },
  });
  return [...new Set(videos.map((v) => v.mediaFileId!))];
}
