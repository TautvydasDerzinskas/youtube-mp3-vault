import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/prisma';

const router = Router();

// Personal vaults are the only realistic input here, but this still bounds
// a pathological/buggy payload from writing an unbounded JSON blob.
const MAX_QUEUE_LENGTH = 5000;
const MAX_HISTORY_LENGTH = 50;

interface QueueEntry {
  playlistId: string;
  videoId: string;
}

function isQueueEntry(v: unknown): v is QueueEntry {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as QueueEntry).playlistId === 'string' &&
    typeof (v as QueueEntry).videoId === 'string'
  );
}

// POST /api/playback-state — upsert. `queue`/`history` are optional on every
// call: heartbeat/track-advance/toggle writes omit them so they don't need
// to resend a potentially large queue — Prisma's update skips any key left
// `undefined` in `data`, so the previously stored value is left untouched.
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as {
      playlistId?: unknown; videoId?: unknown; positionSeconds?: unknown;
      isShuffle?: unknown; isRepeat?: unknown; originPath?: unknown;
      queue?: unknown; history?: unknown;
    };
    const { playlistId, videoId, positionSeconds, isShuffle, isRepeat, originPath } = body;
    if (
      typeof playlistId !== 'string' || typeof videoId !== 'string' ||
      typeof positionSeconds !== 'number' || typeof isShuffle !== 'boolean' ||
      typeof isRepeat !== 'boolean' || typeof originPath !== 'string'
    ) {
      res.status(400).json({ error: 'playlistId, videoId, positionSeconds, isShuffle, isRepeat and originPath are required' });
      return;
    }

    const playlist = await prisma.playlist.findFirst({ where: { id: playlistId, userId: req.userId } });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    const video = await prisma.playlistVideo.findFirst({ where: { id: videoId, playlistId: playlist.id } });
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const data: {
      playbackPlaylistId: string; playbackVideoId: string; playbackPositionSeconds: number;
      playbackIsShuffle: boolean; playbackIsRepeat: boolean; playbackOriginPath: string;
      playbackUpdatedAt: Date; playbackQueue?: Prisma.InputJsonValue; playbackHistory?: Prisma.InputJsonValue;
    } = {
      playbackPlaylistId: playlistId,
      playbackVideoId: videoId,
      playbackPositionSeconds: positionSeconds,
      playbackIsShuffle: isShuffle,
      playbackIsRepeat: isRepeat,
      playbackOriginPath: originPath,
      playbackUpdatedAt: new Date(),
    };

    for (const [key, target] of [['queue', 'playbackQueue'], ['history', 'playbackHistory']] as const) {
      const raw = body[key];
      if (raw === undefined) continue;
      const maxLength = key === 'queue' ? MAX_QUEUE_LENGTH : MAX_HISTORY_LENGTH;
      if (!Array.isArray(raw) || raw.length > maxLength || !raw.every(isQueueEntry)) {
        res.status(400).json({ error: `${key} must be an array of at most ${maxLength} { playlistId, videoId } entries` });
        return;
      }
      const entries = raw as QueueEntry[];
      const uniquePlaylistIds = [...new Set(entries.map(e => e.playlistId))];
      const ownedCount = await prisma.playlist.count({ where: { userId: req.userId, id: { in: uniquePlaylistIds } } });
      if (ownedCount !== uniquePlaylistIds.length) {
        res.status(400).json({ error: `${key} references a playlist that doesn't belong to this account` });
        return;
      }
      data[target] = entries as unknown as Prisma.InputJsonValue;
    }

    await prisma.user.update({ where: { id: req.userId }, data });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/playback-state — the persisted resume point, or { state: null }
// once nothing's been saved (or it was explicitly cleared).
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        playbackPlaylistId: true, playbackVideoId: true, playbackPositionSeconds: true,
        playbackIsShuffle: true, playbackIsRepeat: true, playbackOriginPath: true,
        playbackQueue: true, playbackHistory: true,
      },
    });

    if (!user?.playbackVideoId || !user.playbackPlaylistId) {
      res.json({ state: null });
      return;
    }

    res.json({
      state: {
        playlistId: user.playbackPlaylistId,
        videoId: user.playbackVideoId,
        positionSeconds: user.playbackPositionSeconds ?? 0,
        isShuffle: user.playbackIsShuffle,
        isRepeat: user.playbackIsRepeat,
        originPath: user.playbackOriginPath ?? '/playlists',
        queue: user.playbackQueue ?? [],
        history: user.playbackHistory ?? [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/playback-state/clear — called when the user explicitly closes
// the mini player. Deliberately not called on pause — a paused-and-abandoned
// tab should still resume correctly elsewhere.
router.post('/clear', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        playbackPlaylistId: null, playbackVideoId: null, playbackPositionSeconds: null,
        playbackIsShuffle: false, playbackIsRepeat: false, playbackOriginPath: null,
        playbackQueue: Prisma.JsonNull, playbackHistory: [], playbackUpdatedAt: null,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
