import { Router } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/prisma';
import { withDownloadStats } from '../services/playlistStats';

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

export default router;
