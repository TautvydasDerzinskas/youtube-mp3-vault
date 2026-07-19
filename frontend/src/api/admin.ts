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
};
