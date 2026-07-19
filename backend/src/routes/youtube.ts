import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/prisma';
import { normalizePlaylistUrl, fetchPlaylist } from '../services/youtube';
import { getSharedFilePath, sanitizeFilename } from '../services/downloader';
import { withDownloadStats } from '../services/playlistStats';
import {
  isSyncing,
  startBackgroundDownload,
  syncPlaylist,
  retryFailedVideos,
  setSyncPaused,
  mediaFilesUsedBy,
  cleanupMediaFiles,
} from '../services/syncService';

const router = Router();

// ─── GET /api/playlists ────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    const enriched = await withDownloadStats(playlists);
    res.json({ playlists: enriched });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/playlists — add by URL ─────────────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { url, customName } = req.body as { url?: unknown; customName?: unknown };

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    let normalized: { url: string; playlistId: string };
    try {
      normalized = normalizePlaylistUrl(url);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const existing = await prisma.playlist.findUnique({
      where: { userId_youtubeId: { userId: req.userId!, youtubeId: normalized.playlistId } },
    });
    if (existing) {
      res.status(409).json({ error: 'You have already added this playlist' });
      return;
    }

    // Fetch video list (blocking — gives user feedback via loading dialog)
    let info;
    try {
      info = await fetchPlaylist(normalized.url);
    } catch (err: any) {
      res.status(err.code === 'YTDLP_NOT_FOUND' ? 503 : 422).json({ error: err.message });
      return;
    }

    const displayName =
      typeof customName === 'string' && customName.trim() ? customName.trim() : null;

    const playlist = await prisma.$transaction(async (tx) => {
      const created = await tx.playlist.create({
        data: {
          userId: req.userId!,
          youtubeId: normalized.playlistId,
          title: info.title,
          customName: displayName,
          thumbnailUrl: info.thumbnailUrl,
          videoCount: info.videos.length,
          syncStatus: 'syncing',
        },
      });
      if (info.videos.length > 0) {
        await tx.playlistVideo.createMany({
          data: info.videos.map((v) => ({
            playlistId: created.id,
            youtubeId: v.id,
            title: v.title,
            duration: v.duration,
            thumbnailUrl: v.thumbnailUrl,
            position: v.position,
            isAvailable: v.isAvailable,
            downloadStatus: 'pending',
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    // Return immediately — downloads happen in background
    res.status(201).json({ playlist: { ...playlist, downloadedCount: 0, failedCount: 0, totalSize: 0, currentVideo: null } });
    startBackgroundDownload(playlist.id);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/playlists/:id — rename ────────────────────────────────────────

router.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { customName } = req.body as { customName?: unknown };

    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const newName =
      customName === null
        ? null
        : typeof customName === 'string' && customName.trim()
        ? customName.trim()
        : undefined;

    if (newName === undefined) {
      res.status(400).json({ error: 'customName must be a non-empty string or null' });
      return;
    }

    const updated = await prisma.playlist.update({
      where: { id: playlist.id },
      data: { customName: newName },
    });

    const [enriched] = await withDownloadStats([updated]);
    res.json({ playlist: enriched });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/playlists/:id/videos ────────────────────────────────────────────

router.get('/:id/videos', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    const videos = await prisma.playlistVideo.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    });
    res.json({ videos });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/playlists/:id/sync ─────────────────────────────────────────────

router.post('/:id/sync', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    if (isSyncing(playlist.id)) {
      const [enriched] = await withDownloadStats([playlist]);
      res.status(409).json({ error: 'Playlist is already syncing', playlist: enriched });
      return;
    }

    // Return immediately with syncing status — actual work is async
    const [enriched] = await withDownloadStats([{ ...playlist, syncStatus: 'syncing' }]);
    res.json({ playlist: enriched });

    // Full sync in background
    void syncPlaylist(playlist.id);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/playlists/:id/retry-failed ─────────────────────────────────────

router.post('/:id/retry-failed', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    if (isSyncing(playlist.id)) {
      const [enriched] = await withDownloadStats([playlist]);
      res.status(409).json({ error: 'Playlist is already syncing', playlist: enriched });
      return;
    }

    const [enriched] = await withDownloadStats([playlist]);
    if (enriched.failedCount === 0) {
      res.status(400).json({ error: 'No failed videos to retry' });
      return;
    }

    // Return immediately with syncing status — actual work is async
    const [syncing] = await withDownloadStats([{ ...playlist, syncStatus: 'syncing' }]);
    res.json({ playlist: syncing });

    retryFailedVideos(playlist.id);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/playlists/:id/pause & /resume — toggle cron auto-sync ──────────

router.post('/:id/pause', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    const updated = await setSyncPaused(playlist.id, true);
    const [enriched] = await withDownloadStats([updated]);
    res.json({ playlist: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    await setSyncPaused(playlist.id, false);

    // Immediately continue downloading any videos left pending from before the
    // pause, rather than waiting for the next manual sync or cron tick.
    const shouldResume = !isSyncing(playlist.id);
    if (shouldResume) {
      await prisma.playlist.update({ where: { id: playlist.id }, data: { syncStatus: 'syncing' } });
    }
    const [enriched] = await withDownloadStats([
      { ...playlist, syncPaused: false, syncStatus: shouldResume ? 'syncing' : playlist.syncStatus },
    ]);
    res.json({ playlist: enriched });

    if (shouldResume) startBackgroundDownload(playlist.id);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/playlists/:id/videos/:videoId/download ──────────────────────────

router.get('/:id/videos/:videoId/download', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const video = await prisma.playlistVideo.findFirst({
      where: { id: req.params.videoId, playlistId: playlist.id },
      include: { mediaFile: true },
    });
    if (!video || video.downloadStatus !== 'done' || !video.mediaFile) {
      res.status(404).json({ error: 'File not available' });
      return;
    }

    const filePath = getSharedFilePath(video.mediaFile.filename);
    const downloadName = `${sanitizeFilename(video.title)}.mp3`;
    res.download(filePath, downloadName, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/playlists/:id/videos/:videoId/stream ────────────────────────────
// Same file as /download, but served inline (no Content-Disposition) for
// playback in an <audio> element rather than triggering a save-as.

router.get('/:id/videos/:videoId/stream', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const video = await prisma.playlistVideo.findFirst({
      where: { id: req.params.videoId, playlistId: playlist.id },
      include: { mediaFile: true },
    });
    if (!video || video.downloadStatus !== 'done' || !video.mediaFile) {
      res.status(404).json({ error: 'File not available' });
      return;
    }

    const filePath = getSharedFilePath(video.mediaFile.filename);
    res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/playlists/:id ────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    // Snapshot which shared media files this playlist used BEFORE deleting it —
    // the cascade delete below removes the playlist_videos rows (and thus their
    // references), so there's nothing left to read afterward.
    const mediaFileIds = await mediaFilesUsedBy(playlist.id);
    await prisma.playlist.delete({ where: { id: playlist.id } });
    // GC shared files no longer referenced by any playlist — asynchronously, don't fail the request
    cleanupMediaFiles(mediaFileIds).catch((err) =>
      console.error('[delete] Failed to clean up media files:', err)
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
