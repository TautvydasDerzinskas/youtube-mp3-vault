import client from './client';
import { Playlist } from './playlists';

// Mirrors frontend/src/api/admin.ts — same endpoints/shapes (see
// backend/src/routes/admin.ts). requireAdmin gates the whole router
// server-side, so every call here 403s for a non-admin user regardless of
// whether the mobile UI itself ever lets a non-admin reach these screens.
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  language: string;
  emailVerified: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  scrobblingEnabled: boolean;
  createdAt: string;
  playlistCount: number;
}

export type LogAction =
  | 'playlist_imported'
  | 'playlist_renamed'
  | 'playlist_deleted'
  | 'playlist_synced'
  | 'playlist_sync_paused'
  | 'playlist_offline_enabled'
  | 'generated_playlist_created'
  | 'generated_playlist_renamed'
  | 'generated_playlist_deleted'
  | 'user_logged_in_web'
  | 'user_logged_in_mobile'
  | 'user_logged_out_web'
  | 'user_logged_out_mobile'
  | 'deezer_connected'
  | 'qobuz_connected';

export interface LogEntry {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  action: LogAction;
  playlistId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface SmtpSettings {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

export interface PostgresSettings {
  database: string;
  user: string;
  password: string;
}

// apiKey alone enables the Discover section; both are needed before any
// user's "Connect to Last.fm" option appears in their Profile.
export interface LastfmSettings {
  apiKey: string | null;
  apiSecret: string | null;
}

// Per-user, opt-in-with-own-credentials HQ providers users can connect from
// their own Profile — Deezer and Qobuz. See
// backend/src/services/settings.ts's HQ_USER_PROVIDERS.
export const HQ_USER_PROVIDERS = ['deezer', 'qobuz'] as const;
export type HqUserProvider = (typeof HQ_USER_PROVIDERS)[number];

export interface HqSettings {
  autoDownloadEnabled: boolean;
  allowedUserProviders: HqUserProvider[];
}

export interface TrackImportSummary {
  updated: number;
  skipped: number;
  notFound: string[];
}

export const adminApi = {
  listUsers: async (): Promise<AdminUser[]> => {
    const { data } = await client.get<{ users: AdminUser[] }>('/admin/users');
    return data.users;
  },

  getUser: async (id: string): Promise<{ user: AdminUser; playlists: Playlist[] }> => {
    const { data } = await client.get<{ user: AdminUser; playlists: Playlist[] }>(`/admin/users/${id}`);
    return data;
  },

  banUser: async (id: string): Promise<AdminUser> => {
    const { data } = await client.post<{ user: AdminUser }>(`/admin/users/${id}/ban`);
    return data.user;
  },

  unbanUser: async (id: string): Promise<AdminUser> => {
    const { data } = await client.post<{ user: AdminUser }>(`/admin/users/${id}/unban`);
    return data.user;
  },

  getSettings: async (): Promise<{ smtp: SmtpSettings; postgres: PostgresSettings; lastfm: LastfmSettings; hq: HqSettings }> => {
    const { data } = await client.get<{ smtp: SmtpSettings; postgres: PostgresSettings; lastfm: LastfmSettings; hq: HqSettings }>('/admin/settings');
    return data;
  },

  updateSmtpSettings: async (settings: SmtpSettings): Promise<SmtpSettings> => {
    const { data } = await client.patch<{ smtp: SmtpSettings }>('/admin/settings/smtp', settings);
    return data.smtp;
  },

  updatePostgresSettings: async (settings: PostgresSettings): Promise<PostgresSettings> => {
    const { data } = await client.post<{ postgres: PostgresSettings }>('/admin/settings/postgres', settings);
    return data.postgres;
  },

  updateLastfmSettings: async (settings: LastfmSettings): Promise<LastfmSettings> => {
    const { data } = await client.patch<{ lastfm: LastfmSettings }>('/admin/settings/lastfm', settings);
    return data.lastfm;
  },

  updateHqSettings: async (settings: HqSettings): Promise<HqSettings> => {
    const { data } = await client.patch<{ hq: HqSettings }>('/admin/settings/hq', settings);
    return data.hq;
  },

  triggerSoftReimport: async (playlistId: string): Promise<void> => {
    await client.post(`/admin/playlists/${playlistId}/soft-reimport`);
  },

  triggerTagRebuild: async (playlistId: string): Promise<void> => {
    await client.post(`/admin/playlists/${playlistId}/rebuild-tags`);
  },

  listLogs: async (params: { userId?: string; from?: string; to?: string }): Promise<LogEntry[]> => {
    const { data } = await client.get<{ logs: LogEntry[] }>('/admin/logs', { params });
    return data.logs;
  },

  exportTracks: async (onlyNonHq: boolean): Promise<{ csv: string; filename: string }> => {
    // responseType/transformResponse forced to plain text — the endpoint
    // returns text/csv, and axios's default JSON transform would otherwise
    // try (and fail) to JSON.parse it.
    const response = await client.get<string>('/admin/tracks/export', {
      params: { onlyNonHq: onlyNonHq ? 'true' : 'false' },
      responseType: 'text',
      transformResponse: (data) => data,
    });
    const disposition = (response.headers as Record<string, string>)['content-disposition'] ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'tracks-export.csv';
    return { csv: response.data, filename };
  },

  importTracks: async (csv: string): Promise<TrackImportSummary> => {
    const { data } = await client.post<TrackImportSummary>('/admin/tracks/import', { csv });
    return data;
  },
};
