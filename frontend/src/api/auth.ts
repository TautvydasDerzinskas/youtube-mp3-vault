import client from './client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  language: string;
}

interface AuthResponse {
  user: User;
}

interface RegisterResponse {
  message: string;
  email: string;
}

interface MessageResponse {
  message: string;
}

export const authApi = {
  register: async (
    email: string,
    password: string,
    displayName: string
  ): Promise<RegisterResponse> => {
    const { data } = await client.post<RegisterResponse>('/auth/register', {
      email,
      password,
      displayName,
    });
    return data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/login', { email, password });
    return data;
  },

  verifyEmail: async (token: string): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/verify-email', { token });
    return data;
  },

  resendVerification: async (email: string): Promise<MessageResponse> => {
    const { data } = await client.post<MessageResponse>('/auth/resend-verification', { email });
    return data;
  },

  logout: async (): Promise<void> => {
    await client.post('/auth/logout');
  },

  me: async (): Promise<AuthResponse> => {
    const { data } = await client.get<AuthResponse>('/auth/me');
    return data;
  },

  updateLanguage: async (language: string): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/language', { language });
    return data;
  },

  updateProfile: async (params: {
    currentPassword: string;
    email?: string;
    newPassword?: string;
  }): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/profile', params);
    return data;
  },
};

