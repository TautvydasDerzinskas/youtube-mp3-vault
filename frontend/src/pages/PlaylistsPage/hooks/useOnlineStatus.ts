import { useEffect, useState } from 'react';
import { statusApi } from '../../../api/status';

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
