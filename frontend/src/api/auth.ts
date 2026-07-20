import client from './client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  language: string;
  isAdmin: boolean;
  pendingEmail: string | null;
  lastfmUsername: string | null;
  scrobblingEnabled: boolean;
}

interface AuthResponse {
  user: User;
}

interface MeResponse {
  user: User;
  // App-wide — whether the backend has a Last.fm shared secret configured at
  // all (see isLastfmScrobblingConfigured on the backend), independent of
  // whether *this* user has connected their own account.
  lastfmScrobblingAvailable: boolean;
}

// Two shapes depending on whether the backend has SMTP configured (see
// backend/src/routes/auth.ts's skipsEmailVerification): normally a "check
// your email" response, but with no way to send that email outside dev, the
// account is created already-verified and signed in immediately instead —
// same shape login's response has.
export type RegisterResponse =
  | { verificationRequired: true; message: string; email: string }
  | { verificationRequired: false; user: User; token: string };

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

  me: async (): Promise<MeResponse> => {
    const { data } = await client.get<MeResponse>('/auth/me');
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

  // Not a fetch — a full-page navigation, since Last.fm shows its own
  // login/approve page before redirecting back to our callback. See
  // ProfilePage's "Connect" button (a plain <a href>, not an onClick).
  lastfmConnectUrl: '/api/auth/lastfm/connect',

  disconnectLastfm: async (): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/lastfm/disconnect');
    return data;
  },

  setScrobbling: async (enabled: boolean): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/lastfm/scrobbling', { enabled });
    return data;
  },
};

