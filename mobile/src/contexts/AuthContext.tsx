import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, User } from '../api/auth';
import { tokenStorage } from '../auth/tokenStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await authApi.me();
        setUser(user);
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
    setUser(user);
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
