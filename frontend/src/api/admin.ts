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

  getSettings: async (): Promise<{ smtp: SmtpSettings; postgres: PostgresSettings; lastfm: LastfmSettings }> => {
    const { data } = await client.get<{ smtp: SmtpSettings; postgres: PostgresSettings; lastfm: LastfmSettings }>('/admin/settings');
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
};
