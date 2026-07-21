import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type LogAction =
  | 'playlist_imported'
  | 'playlist_renamed'
  | 'playlist_deleted'
  | 'playlist_synced'
  | 'playlist_sync_paused'
  | 'generated_playlist_created'
  | 'generated_playlist_renamed'
  | 'generated_playlist_deleted'
  | 'user_logged_in_web'
  | 'user_logged_in_mobile'
  | 'user_logged_out_web'
  | 'user_logged_out_mobile';

export type ClientPlatform = 'web' | 'mobile';

// Neither client sends anything today that distinguishes them by default
// (same /api/auth/login endpoint, generic-looking requests either way) — web
// (frontend/src/api/client.ts) and the mobile app (mobile/src/api/client.ts)
// each deliberately set this header so login/logout events can be attributed
// correctly. Anything else (e.g. a raw API caller) is treated as web.
export function getClientPlatform(req: Request): ClientPlatform {
  return req.headers['x-client-platform'] === 'mobile' ? 'mobile' : 'web';
}

// Fire-and-forget by design — a logging failure must never break the
// user-facing action it's recording, so errors are swallowed here rather
// than propagated to callers.
export async function createLog(params: {
  userId: string;
  action: LogAction;
  playlistId?: string | null;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        userId: params.userId,
        action: params.action,
        playlistId: params.playlistId ?? null,
        details: params.details as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error('[auditLog] Failed to write log entry:', err);
  }
}
