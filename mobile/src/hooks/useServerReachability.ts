import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';
import client from '../api/client';

const BASE_INTERVAL_MS = 15_000;
const MAX_INTERVAL_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5_000;

// Distinct from useOnlineStatus (which polls GET /api/status to ask "does
// the *backend* have its own internet connectivity" — used for gating
// YouTube-dependent actions like sync/Generate Similar). This instead asks
// "can *this phone* reach its configured backend at all" — the actual
// signal for "user has left the local network / server is down," which
// drives the server-unavailable shell (offline playlists, disabled bottom
// nav — see RootNavigator/AppShell and BottomNav's disabled mode).
//
// Starts optimistic (true) so the app doesn't flash into offline mode
// before the first check has had a chance to run. Backs off exponentially
// while unreachable (capped at MAX_INTERVAL_MS) rather than hammering a
// server that's genuinely down, and re-checks immediately whenever the app
// returns to the foreground — the most common way a user actually
// discovers "oh, I'm back on my home network" or notices they've lost it.
export function useServerReachability(): boolean {
  const [isReachable, setIsReachable] = useState(true);
  const backoffRef = useRef(BASE_INTERVAL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const check = async () => {
      try {
        const net = await NetInfo.fetch();
        if (net.isConnected === false) throw new Error('device has no network connection');
        await axios.get(`${client.defaults.baseURL}/health`, { timeout: HEALTH_TIMEOUT_MS });
        if (!mountedRef.current) return;
        setIsReachable(true);
        backoffRef.current = BASE_INTERVAL_MS;
      } catch {
        if (!mountedRef.current) return;
        setIsReachable(false);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_INTERVAL_MS);
      } finally {
        if (mountedRef.current) {
          timerRef.current = setTimeout(check, backoffRef.current);
        }
      }
    };

    check();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (timerRef.current) clearTimeout(timerRef.current);
        check();
      }
    });

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      appStateSub.remove();
    };
  }, []);

  return isReachable;
}
