import { useEffect, useState } from 'react';
import { statusApi } from '../../../api/status';

/**
 * Polls whether the backend can reach the internet. Independent of the sync
 * poll in usePlaylists — runs continuously at a low frequency so the offline
 * banner and disabled sync buttons stay current even when nothing is syncing.
 */
export function useOnlineStatus(intervalMs = 30_000): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const checkStatus = () => statusApi.get().then(s => setOnline(s.online)).catch(() => {});
    checkStatus();
    const id = setInterval(checkStatus, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return online;
}
