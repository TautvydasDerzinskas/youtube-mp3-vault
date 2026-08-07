import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import i18next from 'i18next';
import { authApi, User } from '../api/auth';
import { tokenStorage } from '../auth/tokenStorage';
import { cachedUserStorage } from '../storage/cachedUserStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  lastfmScrobblingAvailable: boolean;
  lastfmDiscoverAvailable: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateLanguage: (language: string) => Promise<void>;
  updateProfile: (params: { currentPassword: string; email?: string; newPassword?: string }) => Promise<void>;
  disconnectLastfm: () => Promise<void>;
  setScrobbling: (enabled: boolean) => Promise<void>;
  setAutoDeleteNonMusic: (enabled: boolean) => Promise<void>;
  setNowPlayingPublic: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Mirrors web's AuthContext.tsx applyUser — the user's stored language
// preference is the single source of truth for UI language, so every path
// that sets `user` also switches i18next to match.
function applyUser(user: User): User {
  i18next.changeLanguage(user.language);
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastfmScrobblingAvailable, setLastfmScrobblingAvailable] = useState(false);
  const [lastfmDiscoverAvailable, setLastfmDiscoverAvailable] = useState(false);
  // Mirrors the two state values above so persistUserCache (called from
  // setters that only receive `user`, e.g. updateProfile) can still write a
  // complete cache entry without needing every one of those callbacks to
  // also thread the flags through.
  const lastfmFlagsRef = useRef({ lastfmScrobblingAvailable: false, lastfmDiscoverAvailable: false });

  const persistUserCache = useCallback((u: User) => {
    cachedUserStorage.set({ user: u, ...lastfmFlagsRef.current }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { user, lastfmScrobblingAvailable, lastfmDiscoverAvailable } = await authApi.me();
        setUser(applyUser(user));
        setLastfmScrobblingAvailable(lastfmScrobblingAvailable);
        setLastfmDiscoverAvailable(lastfmDiscoverAvailable);
        lastfmFlagsRef.current = { lastfmScrobblingAvailable, lastfmDiscoverAvailable };
        persistUserCache(user);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          // The token itself was rejected — genuinely signed out server-side.
          await tokenStorage.clear();
          await cachedUserStorage.clear();
        } else {
          // Network/server-unreachable, not an auth rejection — fall back to
          // the last-known user (if any) instead of forcing a logout, so the
          // app can still boot into the authenticated shell and hand off to
          // the server-unavailable/offline mode (see useServerReachability)
          // rather than stranding the user on the login screen.
          const cached = await cachedUserStorage.get();
          if (cached) {
            setUser(applyUser(cached.user));
            setLastfmScrobblingAvailable(cached.lastfmScrobblingAvailable);
            setLastfmDiscoverAvailable(cached.lastfmDiscoverAvailable);
            lastfmFlagsRef.current = {
              lastfmScrobblingAvailable: cached.lastfmScrobblingAvailable,
              lastfmDiscoverAvailable: cached.lastfmDiscoverAvailable,
            };
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [persistUserCache]);

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await authApi.login(email, password);
    await tokenStorage.set(token);
    setUser(applyUser(user));
    // login's response doesn't include lastfm*Available (only /me does) —
    // fetch it once right after so Last.fm/Generate-Similar gating is
    // correct without waiting for some other trigger to refresh it.
    try {
      const { lastfmScrobblingAvailable, lastfmDiscoverAvailable } = await authApi.me();
      setLastfmScrobblingAvailable(lastfmScrobblingAvailable);
      setLastfmDiscoverAvailable(lastfmDiscoverAvailable);
      lastfmFlagsRef.current = { lastfmScrobblingAvailable, lastfmDiscoverAvailable };
    } catch {
      // Best-effort — worst case these stay hidden until next launch.
    }
    persistUserCache(user);
  }, [persistUserCache]);

  const logout = useCallback(async () => {
    // The JWT isn't server-revocable (see backend/src/middleware/auth.ts) —
    // logging out just means forgetting it locally. The server call is only
    // to record the audit log entry, so it must not block local logout if
    // it fails (e.g. offline) — and it has to run before tokenStorage.clear()
    // below, since it needs the still-valid token for the Authorization header.
    try {
      await authApi.logout();
    } catch {
      // Best-effort — see above.
    }
    await tokenStorage.clear();
    await cachedUserStorage.clear();
    setUser(null);
  }, []);

  const updateLanguage = useCallback(async (language: string) => {
    const { user } = await authApi.updateLanguage(language);
    setUser(applyUser(user));
    persistUserCache(user);
  }, [persistUserCache]);

  const updateProfile = useCallback(async (params: { currentPassword: string; email?: string; newPassword?: string }) => {
    const { user } = await authApi.updateProfile(params);
    setUser(applyUser(user));
    persistUserCache(user);
  }, [persistUserCache]);

  const disconnectLastfm = useCallback(async () => {
    const { user } = await authApi.disconnectLastfm();
    setUser(applyUser(user));
    persistUserCache(user);
  }, [persistUserCache]);

  const setScrobbling = useCallback(async (enabled: boolean) => {
    const { user } = await authApi.setScrobbling(enabled);
    setUser(applyUser(user));
    persistUserCache(user);
  }, [persistUserCache]);

  const setAutoDeleteNonMusic = useCallback(async (enabled: boolean) => {
    const { user } = await authApi.setAutoDeleteNonMusic(enabled);
    setUser(applyUser(user));
    persistUserCache(user);
  }, [persistUserCache]);

  const setNowPlayingPublic = useCallback(async (enabled: boolean) => {
    const { user } = await authApi.setNowPlayingPublic(enabled);
    setUser(applyUser(user));
    persistUserCache(user);
  }, [persistUserCache]);

  return (
    <AuthContext.Provider
      value={{
        user, loading, lastfmScrobblingAvailable, lastfmDiscoverAvailable, login, logout,
        updateLanguage, updateProfile, disconnectLastfm, setScrobbling, setAutoDeleteNonMusic, setNowPlayingPublic,
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
