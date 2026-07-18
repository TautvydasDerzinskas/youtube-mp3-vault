import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../services/prisma';
import {
  requireAuth,
  generateToken,
  setAuthCookie,
  AuthRequest,
} from '../middleware/auth';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const SUPPORTED_LANGUAGES = ['en', 'lt', 'pl'] as const;

function toSafeUser(user: { id: string; email: string; displayName: string; language: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName, language: user.language };
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body as Record<string, unknown>;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof displayName !== 'string'
    ) {
      res.status(400).json({ error: 'Email, password, and display name are required' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (displayName.trim().length < 2) {
      res.status(400).json({ error: 'Display name must be at least 2 characters' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, displayName: displayName.trim() },
    });

    const token = generateToken(user.id);
    setAuthCookie(res, token);
    res.status(201).json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, (req, res, next) => {
  passport.authenticate(
    'local',
    { session: false },
    (err: Error | null, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        res.status(401).json({ error: info?.message || 'Invalid credentials' });
        return;
      }
      const token = generateToken(user.id);
      setAuthCookie(res, token);
      res.json({ user: toSafeUser(user) });
    }
  )(req, res, next);
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, displayName: true, language: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/language
router.patch('/language', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { language } = req.body as { language?: unknown };
    if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.includes(language as any)) {
      res.status(400).json({ error: `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}` });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { language },
    });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/profile — change email and/or password (requires current password)
router.patch('/profile', requireAuth, authLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { email, newPassword, currentPassword } = req.body as Record<string, unknown>;

    if (typeof currentPassword !== 'string' || !currentPassword) {
      res.status(400).json({ error: 'Current password is required' });
      return;
    }
    if (email === undefined && newPassword === undefined) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const validCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validCurrent) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const data: { email?: string; passwordHash?: string } = {};

    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Invalid email address' });
        return;
      }
      const normalizedEmail = email.toLowerCase().trim();
      if (normalizedEmail !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
          res.status(409).json({ error: 'An account with this email already exists' });
          return;
        }
        data.email = normalizedEmail;
      }
    }

    if (newPassword !== undefined) {
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }
      data.passwordHash = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    res.json({ user: toSafeUser(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
