import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import client from '../api/client';
import { serverUrlStorage } from '../storage/serverUrlStorage';
import { DEV_API_URL_OVERRIDE, normalizeServerUrl } from '../config';

interface ServerConfigContextType {
  serverUrl: string | null;
  loading: boolean;
  setServerUrl: (rawUrl: string) => Promise<void>;
  // Drops back to ServerSetupScreen (see Root in App.tsx, which renders it
  // whenever serverUrl is null) without picking a new address first —
  // unlike UpdateServerUrlScreen's logout-then-setServerUrl (which commits
  // both in one step because it already has a tested replacement URL in
  // hand), this is the escape hatch for when the *current* address is the
  // problem and there's nothing to test yet (see OfflinePlaylistsScreen's
  // "change server" action) — e.g. the server's IP/domain changed and the
  // app is stuck offline with no way to reach Profile/Settings to fix it,
  // since TopBar is hidden in offline mode. Callers are expected to log out
  // first (same ordering/reasoning as UpdateServerUrlScreen) so the
  // best-effort server-side logout call still targets the server the
  // current token is actually valid for.
  clearServerUrl: () => Promise<void>;
}

const ServerConfigContext = createContext<ServerConfigContextType | null>(null);

export function ServerConfigProvider({ children }: { children: ReactNode }) {
  const [serverUrl, setServerUrlState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Runs once on launch, before AuthProvider ever mounts (see App.tsx) —
  // client's baseURL must be set before anything tries to use it.
  useEffect(() => {
    (async () => {
      if (DEV_API_URL_OVERRIDE) {
        client.defaults.baseURL = DEV_API_URL_OVERRIDE;
        setServerUrlState(DEV_API_URL_OVERRIDE);
        setLoading(false);
        return;
      }
      const stored = await serverUrlStorage.get();
      if (stored) {
        client.defaults.baseURL = stored;
        setServerUrlState(stored);
      }
      setLoading(false);
    })();
  }, []);

  const setServerUrl = useCallback(async (rawUrl: string) => {
    const normalized = normalizeServerUrl(rawUrl);
    await serverUrlStorage.set(normalized);
    client.defaults.baseURL = normalized;
    setServerUrlState(normalized);
  }, []);

  const clearServerUrl = useCallback(async () => {
    await serverUrlStorage.clear();
    client.defaults.baseURL = undefined;
    setServerUrlState(null);
  }, []);

  return (
    <ServerConfigContext.Provider value={{ serverUrl, loading, setServerUrl, clearServerUrl }}>
      {children}
    </ServerConfigContext.Provider>
  );
}

export function useServerConfig(): ServerConfigContextType {
  const ctx = useContext(ServerConfigContext);
  if (!ctx) throw new Error('useServerConfig must be used within ServerConfigProvider');
  return ctx;
}
