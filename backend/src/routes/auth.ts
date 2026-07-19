import { randomBytes } from 'crypto';
import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../services/prisma';
import { sendVerificationEmail } from '../services/mailer';
import { config } from '../config';
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
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_VERIFICATION_MESSAGE =
  'If an account with that email needs verification, a new email has been sent.';

function toSafeUser(user: {
  id: string;
  email: string;
  displayName: string;
  language: string;
  isAdmin: boolean;
  pendingEmail: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    language: user.language,
    isAdmin: user.isAdmin,
    pendingEmail: user.pendingEmail,
  };
}

function newVerificationToken() {
  return {
    emailVerificationToken: randomBytes(32).toString('hex'),
    emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  };
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
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: displayName.trim(),
        isAdmin: config.adminEmail !== '' && normalizedEmail === config.adminEmail,
        ...newVerificationToken(),
      },
    });

    try {
      await sendVerificationEmail(user.email, user.displayName, user.emailVerificationToken!);
    } catch (err) {
      // Nothing can verify this account without the email — don't leave an
      // unverifiable zombie account behind; let the user just try again.
      await prisma.user.delete({ where: { id: user.id } });
      throw err;
    }

    res.status(201).json({
      message: 'Registered — check your email to verify your account before signing in',
      email: user.email,
    });
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
        const status = info?.code === 'EMAIL_NOT_VERIFIED' ? 403 : 401;
        res.status(status).json({ error: info?.message || 'Invalid credentials', code: info?.code });
        return;
      }
      const token = generateToken(user.id);
      setAuthCookie(res, token);
      // Also returned in the body (not just the cookie) for clients that can't
      // rely on a browser cookie jar — e.g. the mobile app — to store and send
      // back as `Authorization: Bearer <token>`.
      res.json({ user: toSafeUser(user), token });
    }
  )(req, res, next);
});

// POST /api/auth/verify-email
router.post('/verify-email', authLimiter, async (req, res, next) => {
  try {
    const { token } = req.body as { token?: unknown };
    if (typeof token !== 'string' || !token) {
      res.status(400).json({ error: 'Verification token is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { emailVerificationToken: token } });
    if (!user || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      res.status(400).json({ error: 'This verification link is invalid or has expired' });
      return;
    }

    let verified;
    if (user.pendingEmail) {
      // Confirming a requested email change, not the original signup — re-check
      // for a conflict in case someone else took that address in the meantime.
      const conflict = await prisma.user.findFirst({
        where: { email: user.pendingEmail, id: { not: user.id } },
      });
      if (conflict) {
        await prisma.user.update({
          where: { id: user.id },
          data: { pendingEmail: null, emailVerificationToken: null, emailVerificationExpires: null },
        });
        res.status(409).json({
          error: 'That email is no longer available — submit the change again from your profile',
        });
        return;
      }
      verified = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.pendingEmail,
          pendingEmail: null,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });
    } else {
      verified = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
      });
    }

    const authToken = generateToken(verified.id);
    setAuthCookie(res, authToken);
    res.json({ user: toSafeUser(verified), token: authToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body as { email?: unknown };
    if (typeof email !== 'string' || !email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Same response whether the account exists, is already verified, or doesn't
    // exist at all — resending shouldn't be usable to probe registered emails.
    if (user && !user.emailVerified) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: newVerificationToken(),
      });
      await sendVerificationEmail(updated.email, updated.displayName, updated.emailVerificationToken!);
    }

    res.json({ message: RESEND_VERIFICATION_MESSAGE });
  } catch (err) {
    next(err);
  }
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
      select: { id: true, email: true, displayName: true, language: true, isAdmin: true, pendingEmail: true },
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

    const data: {
      passwordHash?: string;
      pendingEmail?: string;
      emailVerificationToken?: string;
      emailVerificationExpires?: Date;
    } = {};
    let emailToVerify: string | undefined;

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
        // Don't apply the change yet — it only takes effect once the new
        // address confirms it via the same verification-link flow as signup.
        data.pendingEmail = normalizedEmail;
        Object.assign(data, newVerificationToken());
        emailToVerify = normalizedEmail;
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
    if (emailToVerify) {
      await sendVerificationEmail(emailToVerify, updated.displayName, updated.emailVerificationToken!);
    }
    res.json({ user: toSafeUser(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
