import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload } from '../types';
import { prisma } from '../services/prisma';

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
}

// The web app authenticates via httpOnly cookie, which isn't usable from a
// native app (no browser cookie jar, and the cookie's httpOnly anyway). The
// mobile client instead gets the JWT back in the login response body (see
// routes/auth.ts) and sends it as a Bearer header — same token, same
// verification path below either way.
function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.auth_token as string | undefined;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return undefined;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  let payload: JWTPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  try {
    // Looked up on every request (rather than trusting the JWT alone) so a ban
    // takes effect immediately instead of only blocking the next login — the
    // JWT itself is otherwise stateless and would stay valid for its full 7d life.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isAdmin: true, isBanned: true },
    });
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    if (user.isBanned) {
      res.status(401).json({ error: 'Your account has been suspended', code: 'ACCOUNT_BANNED' });
      return;
    }
    req.userId = payload.userId;
    req.isAdmin = user.isAdmin;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;
      req.userId = payload.userId;
    } catch {
      // Ignore — treat as unauthenticated
    }
  }
  next();
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId } satisfies JWTPayload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: config.cookieMaxAge,
  });
}
