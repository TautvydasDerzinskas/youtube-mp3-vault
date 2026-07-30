import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import i18next from 'i18next';
import { authApi, User } from '../api/auth';
import { tokenStorage } from '../auth/tokenStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  lastfmScrobblingAvailable: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateLanguage: (language: string) => Promise<void>;
  updateProfile: (params: { currentPassword: string; email?: string; newPassword?: string }) => Promise<void>;
  disconnectLastfm: () => Promise<void>;
  setScrobbling: (enabled: boolean) => Promise<void>;
  setAutoDeleteNonMusic: (enabled: boolean) => Promise<void>;
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

  useEffect(() => {
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { user, lastfmScrobblingAvailable } = await authApi.me();
        setUser(applyUser(user));
        setLastfmScrobblingAvailable(lastfmScrobblingAvailable);
      } catch {
        await tokenStorage.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user, token } = await authApi.login(email, password);
    await tokenStorage.set(token);
    setUser(applyUser(user));
    // login's response doesn't include lastfmScrobblingAvailable (only /me
    // does) — fetch it once right after so the Last.fm tab's gating is
    // correct without waiting for some other trigger to refresh it.
    try {
      const { lastfmScrobblingAvailable } = await authApi.me();
      setLastfmScrobblingAvailable(lastfmScrobblingAvailable);
    } catch {
      // Best-effort — worst case the tab stays hidden until next launch.
    }
  }, []);

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
    setUser(null);
  }, []);

  const updateLanguage = useCallback(async (language: string) => {
    const { user } = await authApi.updateLanguage(language);
    setUser(applyUser(user));
  }, []);

  const updateProfile = useCallback(async (params: { currentPassword: string; email?: string; newPassword?: string }) => {
    const { user } = await authApi.updateProfile(params);
    setUser(applyUser(user));
  }, []);

  const disconnectLastfm = useCallback(async () => {
    const { user } = await authApi.disconnectLastfm();
    setUser(applyUser(user));
  }, []);

  const setScrobbling = useCallback(async (enabled: boolean) => {
    const { user } = await authApi.setScrobbling(enabled);
    setUser(applyUser(user));
  }, []);

  const setAutoDeleteNonMusic = useCallback(async (enabled: boolean) => {
    const { user } = await authApi.setAutoDeleteNonMusic(enabled);
    setUser(applyUser(user));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, loading, lastfmScrobblingAvailable, login, logout,
        updateLanguage, updateProfile, disconnectLastfm, setScrobbling, setAutoDeleteNonMusic,
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
