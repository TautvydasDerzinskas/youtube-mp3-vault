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
}

// Mirrors frontend/src/api/syncReports.ts — same endpoints, same response
// shapes (see backend/src/routes/youtube.ts's /sync-reports routes).
export const syncReportsApi = {
  // Every sync/retry-failed/scan-hq/import run the current user has
  // triggered but not yet dismissed the stats modal for — see PlaylistsScreen, which
  // fetches this on mount so a run that finished while the app was closed
  // is still waiting whenever they next open it.
  listUnseen: async (): Promise<SyncReport[]> => {
    const { data } = await client.get<{ reports: SyncReport[] }>('/playlists/sync-reports/unseen');
    return data.reports;
  },

  markSeen: async (id: string): Promise<void> => {
    await client.post(`/playlists/sync-reports/${id}/seen`);
  },
};
