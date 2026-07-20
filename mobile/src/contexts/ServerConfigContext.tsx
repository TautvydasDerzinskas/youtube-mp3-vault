import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import client from '../api/client';
import { serverUrlStorage } from '../storage/serverUrlStorage';
import { DEV_API_URL_OVERRIDE, normalizeServerUrl } from '../config';

interface ServerConfigContextType {
  serverUrl: string | null;
  loading: boolean;
  setServerUrl: (rawUrl: string) => Promise<void>;
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

  return (
    <ServerConfigContext.Provider value={{ serverUrl, loading, setServerUrl }}>
      {children}
    </ServerConfigContext.Provider>
  );
}

export function useServerConfig(): ServerConfigContextType {
  const ctx = useContext(ServerConfigContext);
  if (!ctx) throw new Error('useServerConfig must be used within ServerConfigProvider');
  return ctx;
}
