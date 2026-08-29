import client from './client';

export type SyncActionType = 'sync' | 'retry_failed' | 'scan_hq' | 'import';

export interface SyncFailureDetail {
  title: string;
  reason: string;
  message: string;
}

export interface SyncReport {
  id: string;
  playlistId: string;
  playlistName: string;
  actionType: SyncActionType;
  startedAt: string;
  durationMs: number;
  addedCount: number;
  removedCount: number;
  downloadedCount: number;
  recoveredCount: number;
  failedCount: number;
  // Keyed by categorizeFailure's buckets on the backend (age_restricted,
  // sign_in_required, unavailable, rate_limited, other) — only buckets that
  // actually occurred this run are present.
  failureReasons: Record<string, number>;
  // Per-video detail behind those bucket counts — capped server-side (see
  // MAX_FAILURE_DETAILS in syncService.ts), so this can be shorter than
  // failedCount on a run with a lot of failures.
  failureDetails: SyncFailureDetail[];
  newHqCount: number;
  createdAt: string;
  // Null until the user actually views it (opens the notification bell, or
  // dismisses the live modal) — see NotificationsContext/NotificationBell.
  seenAt: string | null;
}

export const syncReportsApi = {
  // Every sync/retry-failed/scan-hq/import run the current user has
  // triggered but not yet viewed — used by the Playlists page's live modal
  // (a run that finishes while that page is open) and, for the initial
  // unread-count poll, by the notification bell.
  listUnseen: async (): Promise<SyncReport[]> => {
    const { data } = await client.get<{ reports: SyncReport[] }>('/playlists/sync-reports/unseen');
    return data.reports;
  },

  // Recent history for the current user, newest first, read and unread
  // alike (capped server-side) — backs the notification bell's dropdown.
  listAll: async (): Promise<SyncReport[]> => {
    const { data } = await client.get<{ reports: SyncReport[] }>('/playlists/sync-reports');
    return data.reports;
  },

  markSeen: async (id: string): Promise<void> => {
    await client.post(`/playlists/sync-reports/${id}/seen`);
  },

  // Marks every currently-unseen report as seen in one call — the
  // notification bell does this the moment it's opened.
  markAllSeen: async (): Promise<void> => {
    await client.post('/playlists/sync-reports/seen-all');
  },
};
