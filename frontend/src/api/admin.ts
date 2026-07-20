import client from './client';
import { Playlist } from './youtube';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  language: string;
  emailVerified: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
  playlistCount: number;
}

// host: null means email verification is off — see backend's
// skipsEmailVerification. Values (including password) are returned as-is,
// not masked — see routes/admin.ts's GET /settings for why that's fine here.
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

  getSettings: async (): Promise<{ smtp: SmtpSettings; postgres: PostgresSettings }> => {
    const { data } = await client.get<{ smtp: SmtpSettings; postgres: PostgresSettings }>('/admin/settings');
    return data;
  },

  updateSmtpSettings: async (settings: SmtpSettings): Promise<SmtpSettings> => {
    const { data } = await client.patch<{ smtp: SmtpSettings }>('/admin/settings/smtp', settings);
    return data.smtp;
  },

  // Backend tests the connection before applying it — rejects (422) instead
  // of switching if it can't connect or the target isn't already a migrated
  // instance of this app's schema. See services/prisma.ts's switchDatabase.
  updatePostgresSettings: async (settings: PostgresSettings): Promise<PostgresSettings> => {
    const { data } = await client.post<{ postgres: PostgresSettings }>('/admin/settings/postgres', settings);
    return data.postgres;
  },
};
