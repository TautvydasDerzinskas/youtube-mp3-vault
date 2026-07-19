import client from './client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  language: string;
  isAdmin: boolean;
  pendingEmail: string | null;
}

export const authApi = {
  login: async (email: string, password: string): Promise<{ user: User; token: string }> => {
    const { data } = await client.post<{ user: User; token: string }>('/auth/login', { email, password });
    return data;
  },

  me: async (): Promise<{ user: User }> => {
    const { data } = await client.get<{ user: User }>('/auth/me');
    return data;
  },
};
