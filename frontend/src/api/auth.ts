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
  tidalConnected: boolean;
  tidalCredentialsValid: boolean | null;
}

interface AuthResponse {
  user: User;
}

interface MeResponse {
  user: User;
  lastfmScrobblingAvailable: boolean;
  // Just the app-level Last.fm API key being configured — no per-user login
  // needed. Gates the read-only Discover feature and "Generate similar
  // playlist", as distinct from lastfmScrobblingAvailable above.
  lastfmDiscoverAvailable: boolean;
  // Which per-user HQ providers ("deezer", "qobuz", "tidal") the admin
  // currently allows connecting at all — an empty array means the whole
  // "HQ Download" profile tab should be hidden, not just individual
  // providers within it.
  allowedHqProviders: string[];
}

export interface TidalStartResponse {
  verificationUri: string;
  userCode: string;
  expiresInSec: number;
  intervalSec: number;
}

// Mirrors the PollResult union in backend/src/services/tidal.ts, plus the
// 'expired' case routes/auth.ts's GET /tidal/poll reports when there's no
// pending device code left for this user (either it was never started, or
// startedAt + expiresInSec has passed) — either way the client's only sane
// move is to call startTidalAuth again for a fresh code.
export type TidalPollResponse =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'error' }
  | { status: 'connected'; user: User };

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

  lastfmConnectUrl: '/api/auth/lastfm/connect',

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

  startTidalAuth: async (): Promise<TidalStartResponse> => {
    const { data } = await client.post<TidalStartResponse>('/auth/tidal/start');
    return data;
  },

  pollTidalAuth: async (): Promise<TidalPollResponse> => {
    const { data } = await client.get<TidalPollResponse>('/auth/tidal/poll');
    return data;
  },

  disconnectTidal: async (): Promise<AuthResponse> => {
    const { data } = await client.post<AuthResponse>('/auth/tidal/disconnect');
    return data;
  },
};

