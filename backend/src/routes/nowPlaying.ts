import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/prisma';
import { parseArtistAndTitle } from '../services/musicbrainz';

const router = Router();

// A heartbeat older than this is treated as "nothing playing" even though
// nowPlayingArtist/Title/HeartbeatAt are technically still populated in the
// DB — the client (web PlayerContext.tsx / mobile PlayerContext.tsx) pings
// POST / roughly every 25s while a track is actively playing, so two missed
// beats comfortably means playback stopped without a chance to call
// POST /clear (app killed, backgrounded and suspended, network dropped).
const NOW_PLAYING_STALE_MS = 60 * 1000;

// Deliberately more generous than authLimiter (routes/auth.ts) — this is
// meant to be polled by a status widget/bot on a short interval, not a
// credential-guessing target, but still capped to make email enumeration
// (see GET / below) slow to abuse.
const nowPlayingLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// POST /api/now-playing — heartbeat, called on play-start and on an
// interval while playing. Re-derives artist/title server-side from the
// video row (same parseArtistAndTitle cleanup as the /played route) rather
// than trusting client-supplied text, and denormalizes them onto the user
// row so a later track deletion can't blank out what was just broadcast.
router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { playlistId, videoId } = req.body as { playlistId?: unknown; videoId?: unknown };
    if (typeof playlistId !== 'string' || typeof videoId !== 'string') {
      res.status(400).json({ error: 'playlistId and videoId are required' });
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

    const { artist: parsedArtist, title } = parseArtistAndTitle(video.title, video.channelName);
    const artist = video.artist ?? parsedArtist;

    await prisma.user.update({
      where: { id: req.userId },
      data: { nowPlayingArtist: artist, nowPlayingTitle: title, nowPlayingHeartbeatAt: new Date() },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/now-playing/clear — called on pause, track change, and
// track-end with nothing queued next. Not the only way this gets cleared —
// see NOW_PLAYING_STALE_MS above for the fallback when this never fires.
router.post('/clear', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { nowPlayingArtist: null, nowPlayingTitle: null, nowPlayingHeartbeatAt: null },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/now-playing?email=... — deliberately not behind requireAuth: the
// whole point is to be queryable by something other than the account owner
// (a status widget, a bot). Since that makes it the first email-keyed
// lookup in this codebase, the response is identical — { playing: false }
// — whether the email doesn't exist, belongs to a user who never opted in
// via nowPlayingPublic, or their heartbeat is stale, so this can't be used
// to probe which emails have accounts here.
router.get('/', nowPlayingLookupLimiter, async (req, res, next) => {
  try {
    const { email } = req.query as { email?: unknown };
    if (typeof email !== 'string' || !email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { nowPlayingPublic: true, nowPlayingArtist: true, nowPlayingTitle: true, nowPlayingHeartbeatAt: true },
    });

    const isFresh = Boolean(
      user?.nowPlayingHeartbeatAt && Date.now() - user.nowPlayingHeartbeatAt.getTime() < NOW_PLAYING_STALE_MS
    );
    if (!user?.nowPlayingPublic || !isFresh || !user.nowPlayingTitle) {
      res.json({ playing: false });
      return;
    }

    res.json({ playing: true, artist: user.nowPlayingArtist, title: user.nowPlayingTitle });
  } catch (err) {
    next(err);
  }
});

export default router;
