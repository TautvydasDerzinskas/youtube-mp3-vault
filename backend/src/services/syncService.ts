import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { fetchPlaylist } from './youtube';
import { downloadVideo, publishToSharedStore, removeSharedFile, isPermanentlyUnavailable } from './downloader';

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

async function _downloadPending(playlistId: string): Promise<void> {
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
  _downloadPending(playlistId).finally(() => activeSyncs.delete(playlistId));
}

export async function syncPlaylist(playlistId: string): Promise<void> {
  if (activeSyncs.has(playlistId)) {
    console.log(`[sync] ${playlistId} already syncing — skipped`);
    return;
  }
  activeSyncs.add(playlistId);

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, youtubeId: true },
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

    // ── 4. Add new videos ─────────────────────────────────────────────────────
    const newVideos = info.videos.filter((v) => !dbIds.has(v.id));
    if (newVideos.length > 0) {
      await prisma.playlistVideo.createMany({
        data: newVideos.map((v) => ({
          playlistId,
          youtubeId: v.id,
          title: v.title,
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

    await _downloadPending(playlistId);
    // _downloadPending sets syncStatus → idle / error

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
      await _downloadPending(playlistId);
      // _downloadPending sets syncStatus → idle / error
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
    where: { syncStatus: { not: 'syncing' }, syncPaused: false },
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

/** Distinct MediaFile ids currently used by a playlist's downloaded videos — snapshot before deleting the playlist. */
export async function mediaFilesUsedBy(playlistId: string): Promise<string[]> {
  const videos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: 'done', mediaFileId: { not: null } },
    select: { mediaFileId: true },
  });
  return [...new Set(videos.map((v) => v.mediaFileId!))];
}
