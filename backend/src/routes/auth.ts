import { randomBytes } from 'crypto';
import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../services/prisma';
import { sendVerificationEmail } from '../services/mailer';
import { isSmtpConfigured, isLastfmScrobblingConfigured, isLastfmDiscoverEnabled, isUserHqProviderAllowed, getHqSettings } from '../services/settings';
import { getAuthUrl, getSession } from '../services/lastfm';
import { verifyDeezerLogin } from '../services/deezer';
import { verifyQobuzLogin } from '../services/qobuz';
import {
  startDeviceAuth,
  pollDeviceAuth,
  setPendingDeviceAuth,
  getPendingDeviceAuth,
  clearPendingDeviceAuth,
} from '../services/tidal';
import { isOnline } from '../services/connectivity';
import { removeExistingNonMusicVideos } from '../services/syncService';
import { config } from '../config';
import {
  requireAuth,
  optionalAuth,
  generateToken,
  setAuthCookie,
  AuthRequest,
} from '../middleware/auth';
import { createLog, getClientPlatform } from '../services/auditLog';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const SUPPORTED_LANGUAGES = ['en', 'lt', 'pl'] as const;
const SUPPORTED_THEME_MODES = ['light', 'dark'] as const;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_VERIFICATION_MESSAGE =
  'If an account with that email needs verification, a new email has been sent.';

function toSafeUser(user: {
  id: string;
  email: string;
  displayName: string;
  language: string;
  themeMode: string;
  isAdmin: boolean;
  pendingEmail: string | null;
  lastfmUsername: string | null;
  scrobblingEnabled: boolean;
  autoDeleteNonMusicEnabled: boolean;
  nowPlayingPublic: boolean;
  deezerArlCookie?: string | null;
  deezerCookieValid?: boolean | null;
  qobuzEmail?: string | null;
  qobuzCredentialsValid?: boolean | null;
  tidalAccessToken?: string | null;
  tidalCredentialsValid?: boolean | null;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    language: user.language,
    themeMode: user.themeMode,
    isAdmin: user.isAdmin,
    pendingEmail: user.pendingEmail,
    lastfmUsername: user.lastfmUsername,
    scrobblingEnabled: user.scrobblingEnabled,
    autoDeleteNonMusicEnabled: user.autoDeleteNonMusicEnabled,
    nowPlayingPublic: user.nowPlayingPublic,
    // Never echoes the cookie itself back to the client, only whether one is
    // set — same "connected, not the credential" shape lastfmUsername gives
    // for Last.fm above.
    deezerConnected: Boolean(user.deezerArlCookie),
    deezerCookieValid: user.deezerCookieValid ?? null,
    // Same shape as Deezer, minus ever echoing back the stored password —
    // just whether an account is connected, and its most recent login check.
    qobuzConnected: Boolean(user.qobuzEmail),
    qobuzCredentialsValid: user.qobuzCredentialsValid ?? null,
    // Same shape again, minus ever echoing back the access token — just
    // whether the device-code flow has been completed, and its most recent
    // verify/refresh outcome (see services/tidal.ts's establishTidalSession).
    tidalConnected: Boolean(user.tidalAccessToken),
    tidalCredentialsValid: user.tidalCredentialsValid ?? null,
  };
}

function newVerificationToken() {
  return {
    emailVerificationToken: randomBytes(32).toString('hex'),
    emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  };
}

function skipsEmailVerification(): boolean {
  return !isSmtpConfigured() && config.appEnv !== 'dev';
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
    const isAdmin = config.adminEmail !== '' && normalizedEmail === config.adminEmail;

    if (skipsEmailVerification()) {
      const user = await prisma.user.create({
        data: { email: normalizedEmail, passwordHash, displayName: displayName.trim(), isAdmin, emailVerified: true },
      });
      const token = generateToken(user.id);
      setAuthCookie(res, token);
      res.status(201).json({ verificationRequired: false, user: toSafeUser(user), token });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: displayName.trim(),
        isAdmin,
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
      verificationRequired: true,
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
      res.json({ user: toSafeUser(user), token });

      void createLog({
        userId: user.id,
        action: getClientPlatform(req) === 'mobile' ? 'user_logged_in_mobile' : 'user_logged_in_web',
        details: { email: user.email },
      });
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
      if (skipsEmailVerification()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
        });
      } else {
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: newVerificationToken(),
        });
        await sendVerificationEmail(updated.email, updated.displayName, updated.emailVerificationToken!);
      }
    }

    res.json({ message: RESEND_VERIFICATION_MESSAGE });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
// optionalAuth (not requireAuth) — logout must still succeed (clearing the
// cookie client-side) even if the token is missing/expired; it only
// identifies who to log the event for when a valid session was present.
router.post('/logout', optionalAuth, (req: AuthRequest, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });

  if (req.userId) {
    void createLog({
      userId: req.userId,
      action: getClientPlatform(req) === 'mobile' ? 'user_logged_out_mobile' : 'user_logged_out_web',
      details: {},
    });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, email: true, displayName: true, language: true, themeMode: true, isAdmin: true, pendingEmail: true,
        lastfmUsername: true, scrobblingEnabled: true, autoDeleteNonMusicEnabled: true, nowPlayingPublic: true,
        deezerArlCookie: true, deezerCookieValid: true,
        qobuzEmail: true, qobuzCredentialsValid: true,
        tidalAccessToken: true, tidalCredentialsValid: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      user: toSafeUser(user),
      lastfmScrobblingAvailable: isLastfmScrobblingConfigured(),
      lastfmDiscoverAvailable: isLastfmDiscoverEnabled(),
      // Which per-user HQ provider sections (Deezer, Qobuz) the admin
      // currently allows connecting at all — see schema.prisma's
      // hqAllowedUserProviders. An empty array means the client should hide
      // the whole "HQ Download" profile tab, not just grey out individual
      // providers within it.
      allowedHqProviders: getHqSettings().allowedUserProviders,
    });
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

// PATCH /api/auth/theme
router.patch('/theme', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { themeMode } = req.body as { themeMode?: unknown };
    if (typeof themeMode !== 'string' || !SUPPORTED_THEME_MODES.includes(themeMode as any)) {
      res.status(400).json({ error: `themeMode must be one of: ${SUPPORTED_THEME_MODES.join(', ')}` });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { themeMode },
    });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/settings/auto-delete-non-music
router.patch('/settings/auto-delete-non-music', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { autoDeleteNonMusicEnabled: enabled },
    });
    if (enabled) {
      // Fire-and-forget — a library-wide sweep can take a while, and the
      // toggle itself should save instantly regardless of library size.
      removeExistingNonMusicVideos(req.userId!).catch((err) =>
        console.error(`[auth] Non-music sweep failed for user ${req.userId}:`, err)
      );
    }
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/settings/now-playing-public — see routes/nowPlaying.ts for
// what turning this on actually exposes.
router.patch('/settings/now-playing-public', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    const data: { nowPlayingPublic: boolean; nowPlayingArtist?: null; nowPlayingTitle?: null; nowPlayingHeartbeatAt?: null } = {
      nowPlayingPublic: enabled,
    };
    // Turning it off should also stop reporting whatever was last playing —
    // otherwise a stale value could still be visible for up to
    // NOW_PLAYING_STALE_MS if the toggle flips mid-playback.
    if (!enabled) {
      data.nowPlayingArtist = null;
      data.nowPlayingTitle = null;
      data.nowPlayingHeartbeatAt = null;
    }
    const user = await prisma.user.update({ where: { id: req.userId }, data });
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
      email?: string;
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
        if (skipsEmailVerification()) {
          // No way to confirm a change via email — apply it immediately
          // instead of queuing an unconfirmable pendingEmail.
          data.email = normalizedEmail;
        } else {
          // Don't apply the change yet — it only takes effect once the new
          // address confirms it via the same verification-link flow as signup.
          data.pendingEmail = normalizedEmail;
          Object.assign(data, newVerificationToken());
          emailToVerify = normalizedEmail;
        }
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

router.get('/lastfm/connect', requireAuth, (_req, res) => {
  if (!isOnline()) {
    res.status(503).json({ error: 'No internet connectivity — try again once this server is back online' });
    return;
  }
  const callbackUrl = `${config.frontendUrl}/api/auth/lastfm/callback`;
  const url = getAuthUrl(callbackUrl);
  if (!url) {
    res.status(503).json({ error: 'Last.fm is not configured on this server' });
    return;
  }
  res.redirect(url);
});

router.get('/lastfm/callback', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { token } = req.query as { token?: string };
    const session = typeof token === 'string' ? await getSession(token) : null;
    if (!session) {
      res.redirect(`${config.frontendUrl}/profile?lastfm=error`);
      return;
    }
    await prisma.user.update({
      where: { id: req.userId },
      data: { lastfmSessionKey: session.sessionKey, lastfmUsername: session.username },
    });
    res.redirect(`${config.frontendUrl}/profile?lastfm=connected`);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/lastfm/disconnect ──────────────────────────────────────

router.post('/lastfm/disconnect', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { lastfmSessionKey: null, lastfmUsername: null, scrobblingEnabled: false },
    });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/auth/lastfm/scrobbling ─────────────────────────────────────
// Separate from "connected" — connecting doesn't turn this on by itself.

router.patch('/lastfm/scrobbling', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    if (enabled) {
      const existing = await prisma.user.findUnique({ where: { id: req.userId }, select: { lastfmSessionKey: true } });
      if (!existing?.lastfmSessionKey) {
        res.status(400).json({ error: 'Connect your Last.fm account before enabling scrobbling' });
        return;
      }
    }
    const user = await prisma.user.update({ where: { id: req.userId }, data: { scrobblingEnabled: enabled } });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/auth/deezer ─────────────────────────────────────────────
// Saves a user's own Deezer "arl" cookie (see services/deezer.ts for what
// this unlocks) and verifies it immediately when possible, same "check it
// now, not just at the next sync" spirit as slskdQualityWorker.ts's
// per-sync check. Offline, the cookie is still saved (deezerCookieValid
// left null/"unknown") — resolvePlaylistQuality will verify it the next
// time it actually runs.

router.patch('/deezer', requireAuth, authLimiter, async (req: AuthRequest, res, next) => {
  try {
    if (!isUserHqProviderAllowed('deezer')) {
      res.status(403).json({ error: 'Deezer HQ downloads are currently disabled by the administrator' });
      return;
    }
    const { arlCookie } = req.body as { arlCookie?: unknown };
    if (typeof arlCookie !== 'string' || !arlCookie.trim()) {
      res.status(400).json({ error: 'arlCookie is required' });
      return;
    }
    const trimmed = arlCookie.trim();
    const valid = isOnline() ? await verifyDeezerLogin(trimmed) : null;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { deezerArlCookie: trimmed, deezerCookieValid: valid, deezerCookieCheckedAt: valid === null ? null : new Date() },
    });
    void createLog({ userId: user.id, action: 'deezer_connected', details: { valid } });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/deezer/disconnect ──────────────────────────────────────

router.post('/deezer/disconnect', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { deezerArlCookie: null, deezerCookieValid: null, deezerCookieCheckedAt: null },
    });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/auth/qobuz ──────────────────────────────────────────────────
// Saves a user's own Qobuz email/password (see services/qobuz.ts for what
// this unlocks) and verifies it immediately when possible, same "check it
// now, not just at the next sync" spirit as the Deezer endpoint above.
// Offline, the credentials are still saved (qobuzCredentialsValid left
// null/"unknown") — resolvePlaylistQuality will verify them the next time
// it actually runs.

router.patch('/qobuz', requireAuth, authLimiter, async (req: AuthRequest, res, next) => {
  try {
    if (!isUserHqProviderAllowed('qobuz')) {
      res.status(403).json({ error: 'Qobuz HQ downloads are currently disabled by the administrator' });
      return;
    }
    const { email, password } = req.body as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    const trimmedEmail = email.trim();
    const valid = isOnline() ? await verifyQobuzLogin(trimmedEmail, password) : null;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        qobuzEmail: trimmedEmail,
        qobuzPassword: password,
        qobuzCredentialsValid: valid,
        qobuzCredentialsCheckedAt: valid === null ? null : new Date(),
      },
    });
    void createLog({ userId: user.id, action: 'qobuz_connected', details: { valid } });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/qobuz/disconnect ────────────────────────────────────────

router.post('/qobuz/disconnect', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { qobuzEmail: null, qobuzPassword: null, qobuzCredentialsValid: null, qobuzCredentialsCheckedAt: null },
    });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/tidal/start ────────────────────────────────────────────
// Kicks off Tidal's device-code flow (see services/tidal.ts's own doc
// comment for why this is a code-entry flow rather than a form, unlike
// Deezer's cookie paste or Qobuz's email/password). Returns the short
// verification link + code for the client to display; the device code
// itself stays server-side (see setPendingDeviceAuth) — the client only
// ever gets back what a user is meant to see and type in.

router.post('/tidal/start', requireAuth, authLimiter, async (req: AuthRequest, res, next) => {
  try {
    if (!isUserHqProviderAllowed('tidal')) {
      res.status(403).json({ error: 'Tidal HQ downloads are currently disabled by the administrator' });
      return;
    }
    if (!isOnline()) {
      res.status(503).json({ error: 'No internet connectivity — try again once this server is back online' });
      return;
    }
    const auth = await startDeviceAuth();
    if (!auth) {
      res.status(502).json({ error: "Couldn't start the Tidal login — try again" });
      return;
    }
    setPendingDeviceAuth(req.userId!, auth);
    res.json({
      verificationUri: auth.verificationUri,
      userCode: auth.userCode,
      expiresInSec: auth.expiresInSec,
      intervalSec: auth.intervalSec,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/tidal/poll ──────────────────────────────────────────────
// Meant to be called repeatedly (every intervalSec from the /start response)
// while the user is off confirming the code on tidal.com — 'pending' just
// means keep polling, 'expired' means the code from /start timed out (call
// /start again for a fresh one), 'error' covers everything else (denied,
// network failure). Only 'connected' — the user actually finished — saves
// anything or clears the pending entry short of expiry/error.

router.get('/tidal/poll', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const pending = getPendingDeviceAuth(req.userId!);
    if (!pending) {
      res.json({ status: 'expired' });
      return;
    }

    const result = await pollDeviceAuth(pending.deviceCode);
    if (result.status === 'pending') {
      res.json({ status: 'pending' });
      return;
    }

    clearPendingDeviceAuth(req.userId!);
    if (result.status === 'error') {
      res.json({ status: 'error' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        tidalAccessToken: result.tokens.accessToken,
        tidalRefreshToken: result.tokens.refreshToken,
        tidalUserId: result.tokens.userId,
        tidalCountryCode: result.tokens.countryCode,
        tidalCredentialsValid: true,
        tidalCredentialsCheckedAt: new Date(),
      },
    });
    void createLog({ userId: user.id, action: 'tidal_connected', details: {} });
    res.json({ status: 'connected', user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/tidal/disconnect ───────────────────────────────────────

router.post('/tidal/disconnect', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    clearPendingDeviceAuth(req.userId!);
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        tidalAccessToken: null,
        tidalRefreshToken: null,
        tidalUserId: null,
        tidalCountryCode: null,
        tidalCredentialsValid: null,
        tidalCredentialsCheckedAt: null,
      },
    });
    res.json({ user: toSafeUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
