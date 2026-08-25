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
  autoDeleteNonMusicEnabled: boolean;
  nowPlayingPublic: boolean;
  deezerConnected: boolean;
  deezerCookieValid: boolean | null;
  qobuzConnected: boolean;
  qobuzCredentialsValid: boolean | null;
}

interface AuthResponse {
  user: User;
}

interface MeResponse {
  user: User;
  lastfmScrobblingAvailable: boolean;
  lastfmDiscoverAvailable: boolean;
  // Which per-user HQ providers ("deezer", "qobuz") the admin currently
  // allows connecting at all — empty means hide the whole "HQ Download"
  // profile tab, not just individual providers within it.
  allowedHqProviders: string[];
}

// Mirrors frontend/src/api/auth.ts's subset actually needed on mobile —
// register/verifyEmail/resendVerification aren't ported since there's no
// mobile registration flow yet (login-only), and lastfmConnectUrl isn't
// ported since the OAuth redirect dance it drives relies on cookie-based
// session auth carrying across a full-page browser redirect chain, which
// doesn't translate to mobile's bearer-token auth without a custom URL
// scheme + backend accommodation — out of scope for now (see LastfmTab).
export const authApi = {
  login: async (email: string, password: string): Promise<{ user: User; token: string }> => {
    const { data } = await client.post<{ user: User; token: string }>('/auth/login', { email, password });
    return data;
  },

  me: async (): Promise<MeResponse> => {
    const { data } = await client.get<MeResponse>('/auth/me');
    return data;
  },

  logout: async (): Promise<void> => {
    await client.post('/auth/logout');
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

  disconnectLastfm: async (): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/lastfm/disconnect');
    return data;
  },

  setScrobbling: async (enabled: boolean): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/lastfm/scrobbling', { enabled });
    return data;
  },

  setAutoDeleteNonMusic: async (enabled: boolean): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/settings/auto-delete-non-music', { enabled });
    return data;
  },

  setNowPlayingPublic: async (enabled: boolean): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/settings/now-playing-public', { enabled });
    return data;
  },

  saveDeezerCookie: async (arlCookie: string): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/deezer', { arlCookie });
    return data;
  },

  disconnectDeezer: async (): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/deezer/disconnect');
    return data;
  },

  saveQobuzCredentials: async (email: string, password: string): Promise<AuthResponse> => {
    const { data } = await client.patch<AuthResponse>('/auth/qobuz', { email, password });
    return data;
  },

  disconnectQobuz: async (): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/qobuz/disconnect');
    return data;
  },
};
