import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import i18next from 'i18next';
import { authApi, User } from '../api/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<{ message: string; email: string }>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateLanguage: (language: string) => Promise<void>;
  updateProfile: (params: { currentPassword: string; email?: string; newPassword?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function applyUser(user: User) {
  i18next.changeLanguage(user.language);
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(applyUser(user));
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
    return authApi.register(email, password, displayName);
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

  const updateProfile = async (params: { currentPassword: string; email?: string; newPassword?: string }) => {
    const { user } = await authApi.updateProfile(params);
    setUser(applyUser(user));
  };

  return (
    <AuthContext.Provider
      value={{
        user, loading, login, register, verifyEmail, resendVerification,
        logout, refreshUser, updateLanguage, updateProfile,
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
