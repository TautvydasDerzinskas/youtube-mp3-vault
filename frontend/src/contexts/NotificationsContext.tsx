import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { SyncReport, syncReportsApi } from '../api/syncReports';
import { useAuth } from './AuthContext';

const POLL_INTERVAL_MS = 15_000;

interface NotificationsContextType {
  // Recent history, newest first, read and unread alike — see
  // syncReportsApi.listAll. Powers the notification bell's dropdown.
  reports: SyncReport[];
  unreadCount: number;
  refresh: () => void;
  // Marks every currently-unseen report as seen (both locally and
  // server-side) — called by the bell the moment its dropdown opens.
  markAllSeen: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

// App-wide (not scoped to the Playlists page) so a sync/HQ-scan/retry/import
// finishing shows up in the bell no matter which page the user is on — see
// AppLayout, which mounts this once above every routed page. Distinct from
// PlaylistsPage's own live SyncReportModal: that one only ever fires for a
// run that finishes while the Playlists page happens to be open (see its own
// busy-transition effect); this one is the catch-all for everything else,
// plus the source of truth for the bell's unread badge regardless of page.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [reports, setReports] = useState<SyncReport[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    syncReportsApi.listAll().then(setReports).catch(() => {});
  }, []);

  useEffect(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    if (!user) { setReports([]); return; }

    let cancelled = false;
    const tick = () => {
      syncReportsApi.listAll().then((fresh) => {
        if (!cancelled) setReports(fresh);
      }).catch(() => {}).finally(() => {
        if (!cancelled) pollRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      });
    };
    tick();

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [user]);

  // Optimistic — flips every currently-unread report's seenAt locally so the
  // badge clears immediately, rather than waiting on the next poll tick.
  const markAllSeen = useCallback(() => {
    setReports((prev) => {
      if (!prev.some((r) => !r.seenAt)) return prev;
      const now = new Date().toISOString();
      return prev.map((r) => (r.seenAt ? r : { ...r, seenAt: now }));
    });
    syncReportsApi.markAllSeen().catch(() => {
      // Worst case the badge undercounts until the next poll tick corrects
      // it — not worth surfacing an error for a background notification sync.
    });
  }, []);

  const unreadCount = reports.filter((r) => !r.seenAt).length;

  return (
    <NotificationsContext.Provider value={{ reports, unreadCount, refresh, markAllSeen }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextType {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
