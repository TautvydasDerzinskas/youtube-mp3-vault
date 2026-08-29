import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import i18next from 'i18next';
import { authApi, User, RegisterResponse, TidalStartResponse, TidalPollResponse } from '../api/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  lastfmScrobblingAvailable: boolean;
  lastfmDiscoverAvailable: boolean;
  allowedHqProviders: string[];
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<RegisterResponse>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateLanguage: (language: string) => Promise<void>;
  updateTheme: (themeMode: string) => Promise<void>;
  updateProfile: (params: { currentPassword: string; email?: string; newPassword?: string }) => Promise<void>;
  disconnectLastfm: () => Promise<void>;
  setScrobbling: (enabled: boolean) => Promise<void>;
  setAutoDeleteNonMusic: (enabled: boolean) => Promise<void>;
  setNowPlayingPublic: (enabled: boolean) => Promise<void>;
  saveDeezerCookie: (arlCookie: string) => Promise<void>;
  disconnectDeezer: () => Promise<void>;
  saveQobuzCredentials: (email: string, password: string) => Promise<void>;
  disconnectQobuz: () => Promise<void>;
  startTidalAuth: () => Promise<TidalStartResponse>;
  pollTidalAuth: () => Promise<TidalPollResponse>;
  disconnectTidal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function applyUser(user: User) {
  i18next.changeLanguage(user.language);
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastfmScrobblingAvailable, setLastfmScrobblingAvailable] = useState(false);
  const [lastfmDiscoverAvailable, setLastfmDiscoverAvailable] = useState(false);
  const [allowedHqProviders, setAllowedHqProviders] = useState<string[]>([]);

  const refreshUser = useCallback(async () => {
    try {
      const { user, lastfmScrobblingAvailable, lastfmDiscoverAvailable, allowedHqProviders } = await authApi.me();
      setUser(applyUser(user));
      setLastfmScrobblingAvailable(lastfmScrobblingAvailable);
      setLastfmDiscoverAvailable(lastfmDiscoverAvailable);
      setAllowedHqProviders(allowedHqProviders);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { user } = await authApi.login(email, password);
    setUser(applyUser(user));
  };

  const register = async (email: string, password: string, displayName: string) => {
    const result = await authApi.register(email, password, displayName);
    if (!result.verificationRequired) {
      setUser(applyUser(result.user));
    }
    return result;
  };

  const verifyEmail = async (token: string) => {
    const { user } = await authApi.verifyEmail(token);
    setUser(applyUser(user));
  };

  const resendVerification = async (email: string) => {
    return authApi.resendVerification(email);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const updateLanguage = async (language: string) => {
    const { user } = await authApi.updateLanguage(language);
    setUser(applyUser(user));
  };

  const updateTheme = async (themeMode: string) => {
    const { user } = await authApi.updateTheme(themeMode);
    setUser(applyUser(user));
  };

  const updateProfile = async (params: { currentPassword: string; email?: string; newPassword?: string }) => {
    const { user } = await authApi.updateProfile(params);
    setUser(applyUser(user));
  };

  const disconnectLastfm = async () => {
    const { user } = await authApi.disconnectLastfm();
    setUser(applyUser(user));
  };

  const setScrobbling = async (enabled: boolean) => {
    const { user } = await authApi.setScrobbling(enabled);
    setUser(applyUser(user));
  };

  const setAutoDeleteNonMusic = async (enabled: boolean) => {
    const { user } = await authApi.setAutoDeleteNonMusic(enabled);
    setUser(applyUser(user));
  };

  const setNowPlayingPublic = async (enabled: boolean) => {
    const { user } = await authApi.setNowPlayingPublic(enabled);
    setUser(applyUser(user));
  };

  const saveDeezerCookie = async (arlCookie: string) => {
    const { user } = await authApi.saveDeezerCookie(arlCookie);
    setUser(applyUser(user));
  };

  const disconnectDeezer = async () => {
    const { user } = await authApi.disconnectDeezer();
    setUser(applyUser(user));
  };

  const saveQobuzCredentials = async (email: string, password: string) => {
    const { user } = await authApi.saveQobuzCredentials(email, password);
    setUser(applyUser(user));
  };

  const disconnectQobuz = async () => {
    const { user } = await authApi.disconnectQobuz();
    setUser(applyUser(user));
  };

  const startTidalAuth = async () => {
    return authApi.startTidalAuth();
  };

  // Doesn't apply the user itself on every 'pending' tick — only a
  // 'connected' result actually changes anything worth re-rendering for;
  // the caller (TidalTab) is what turns this into a repeating poll.
  const pollTidalAuth = async () => {
    const result = await authApi.pollTidalAuth();
    if (result.status === 'connected') setUser(applyUser(result.user));
    return result;
  };

  const disconnectTidal = async () => {
    const { user } = await authApi.disconnectTidal();
    setUser(applyUser(user));
  };

  return (
    <AuthContext.Provider
      value={{
        user, loading, lastfmScrobblingAvailable, lastfmDiscoverAvailable, allowedHqProviders, login, register, verifyEmail,
        resendVerification, logout, refreshUser, updateLanguage, updateTheme, updateProfile, disconnectLastfm, setScrobbling,
        setAutoDeleteNonMusic, setNowPlayingPublic, saveDeezerCookie, disconnectDeezer,
        saveQobuzCredentials, disconnectQobuz, startTidalAuth, pollTidalAuth, disconnectTidal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
