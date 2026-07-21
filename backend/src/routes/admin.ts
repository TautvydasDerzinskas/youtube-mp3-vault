import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { prisma, switchDatabase, buildDatabaseUrl } from '../services/prisma';
import { withDownloadStats } from '../services/playlistStats';
import { startSoftReimport } from '../services/reimport';
import {
  getSmtpSettings, updateSmtpSettings, getPostgresSettings, persistPostgresSettings, SmtpSettings,
  getLastfmSettings, updateLastfmSettings,
} from '../services/settings';

const router = Router();

router.use(requireAuth, requireAdmin);

const USER_LIST_SELECT = {
  id: true,
  email: true,
  displayName: true,
  language: true,
  emailVerified: true,
  isAdmin: true,
  isBanned: true,
  createdAt: true,
} as const;

// GET /api/admin/users
router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { ...USER_LIST_SELECT, _count: { select: { playlists: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      users: users.map(({ _count, ...u }) => ({ ...u, playlistCount: _count.playlists })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_LIST_SELECT,
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const playlists = await prisma.playlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const enrichedPlaylists = await withDownloadStats(playlists);

    res.json({ user, playlists: enrichedPlaylists });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', async (req: AuthRequest, res, next) => {
  try {
    if (req.params.id === req.userId) {
      res.status(400).json({ error: 'You cannot ban your own account' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (existing.isAdmin) {
      res.status(400).json({ error: 'You cannot ban an admin account' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: true },
      select: USER_LIST_SELECT,
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/unban
router.post('/users/:id/unban', async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: false },
      select: USER_LIST_SELECT,
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/playlists/:id/soft-reimport
// Re-runs title normalization, MusicBrainz (re)matching, and audio analysis
// for every video in the playlist using files already downloaded — skips
// the mp3 download step entirely. See services/reimport.ts.
router.post('/playlists/:id/soft-reimport', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    if (!startSoftReimport(playlist.id)) {
      res.status(409).json({ error: 'Playlist is already syncing' });
      return;
    }

    res.json({ started: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/logs?userId=&from=&to=
router.get('/logs', async (req, res, next) => {
  try {
    const { userId, from, to } = req.query as Record<string, string | undefined>;

    const where: Prisma.LogWhereInput = {};
    if (userId) where.userId = userId;

    if (from || to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          res.status(400).json({ error: 'Invalid "from" date' });
          return;
        }
        createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          res.status(400).json({ error: 'Invalid "to" date' });
          return;
        }
        createdAt.lte = toDate;
      }
      where.createdAt = createdAt;
    }

    const logs = await prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, email: true } } },
    });

    res.json({
      logs: logs.map(({ user, ...log }) => ({
        ...log,
        userDisplayName: user.displayName,
        userEmail: user.email,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    res.json({ smtp: getSmtpSettings(), postgres: getPostgresSettings(), lastfm: getLastfmSettings() });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings/smtp', async (req, res, next) => {
  try {
    const { host, port, secure, user, pass, from } = req.body as Record<string, unknown>;

    const trimmedHost = typeof host === 'string' ? host.trim() : '';
    const parsedPort = Number(port);
    if (trimmedHost && (!Number.isFinite(parsedPort) || parsedPort <= 0)) {
      res.status(400).json({ error: 'A valid SMTP port is required when a host is set' });
      return;
    }

    const input: SmtpSettings = {
      host: trimmedHost || null,
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587,
      secure: secure === true,
      user: typeof user === 'string' && user.trim() ? user.trim() : null,
      pass: typeof pass === 'string' && pass ? pass : null,
      from: typeof from === 'string' && from.trim() ? from.trim() : 'YoutubeVault <no-reply@localhost>',
    };

    const updated = await updateSmtpSettings(input);
    res.json({ smtp: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/postgres', async (req, res, next) => {
  try {
    const { database, user, password } = req.body as Record<string, unknown>;
    if (
      typeof database !== 'string' || !database.trim() ||
      typeof user !== 'string' || !user.trim() ||
      typeof password !== 'string' || !password
    ) {
      res.status(400).json({ error: 'Database, user, and password are all required' });
      return;
    }

    const candidate = { database: database.trim(), user: user.trim(), password };

    try {
      await switchDatabase(buildDatabaseUrl(candidate));
    } catch (err: any) {
      res.status(422).json({ error: err.message });
      return;
    }

    await persistPostgresSettings(candidate);
    res.json({ postgres: getPostgresSettings() });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings/lastfm', async (req, res, next) => {
  try {
    const { apiKey, apiSecret } = req.body as Record<string, unknown>;
    const updated = await updateLastfmSettings({
      apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null,
      apiSecret: typeof apiSecret === 'string' && apiSecret.trim() ? apiSecret.trim() : null,
    });
    res.json({ lastfm: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
