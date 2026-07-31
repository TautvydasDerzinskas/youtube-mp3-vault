import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { playlistsApi, ManifestTrack } from '../api/playlists';
import { offlineIndex } from './offlineIndex';
import {
  downloadTrack, removeOfflineTrack, removeOfflinePlaylistDir, offlineFileExists,
  runWithConcurrency, MAX_CONCURRENT_DOWNLOADS,
} from './downloader';
import { flushPlayQueue } from './playQueue';
import { OfflinePlaylistEntry, OfflineTrackEntry, OfflineProgress } from './types';

export type { OfflinePlaylistEntry, OfflineTrackEntry, OfflineProgress } from './types';
export { isOfflineSyncComplete } from './types';

interface OfflineDownloadsContextType {
  // Every playlist the local index currently has an entry for — drives both
  // PlaylistRow's "offline" badge and OfflinePlaylistsScreen's list.
  entries: Record<string, OfflinePlaylistEntry>;
  progress: Record<string, OfflineProgress>;
  isEnabled: (playlistId: string) => boolean;
  getLocalUri: (playlistId: string, trackId: string) => string | undefined;
  enableOffline: (playlistId: string) => Promise<void>;
  disableOffline: (playlistId: string) => Promise<void>;
  syncPlaylist: (playlistId: string) => Promise<void>;
}

const OfflineDownloadsContext = createContext<OfflineDownloadsContextType | null>(null);

// A manifest track only has a real file to fetch once the backend itself
// has finished downloading it — anything else (pending/downloading/failed/
// removed) has no downloadUrl (see backend/src/routes/youtube.ts's
// MANIFEST_TRACK_SELECT handler) and can't be part of the on-device set yet.
function isDownloadable(track: ManifestTrack): boolean {
  return track.downloadStatus === 'done' && track.downloadUrl !== null;
}

// Only re-persist the in-progress track list every this-many completions
// (plus always at the very end/on error) — writing the whole JSON index on
// every single track would make syncing a 1500-track playlist effectively
// O(n^2) in file I/O. This still bounds how much progress a killed app can
// lose to a small, acceptable batch.
const PERSIST_EVERY = 25;

const DEFAULT_PROGRESS: OfflineProgress = { total: 0, completed: 0, syncing: false, error: null };

// The sync engine + public API for the offline-download feature (see
// mobile/src/offline/types.ts and downloader.ts). Mounted once near the top
// of the authenticated app (see RootNavigator) so its state/progress survive
// screen navigation, and so the foreground/reconnect effects below only
// ever run once per app session rather than once per screen.
export function OfflineDownloadsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, OfflinePlaylistEntry>>(() => offlineIndex.getAll().playlists);
  const [progress, setProgress] = useState<Record<string, OfflineProgress>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const syncingRef = useRef<Set<string>>(new Set());

  const setPlaylistProgress = useCallback((playlistId: string, patch: Partial<OfflineProgress>) => {
    setProgress(prev => ({
      ...prev,
      [playlistId]: { ...DEFAULT_PROGRESS, ...prev[playlistId], ...patch },
    }));
  }, []);

  const persistEntry = useCallback((entry: OfflinePlaylistEntry) => {
    offlineIndex.setPlaylist(entry);
    setEntries(prev => ({ ...prev, [entry.playlistId]: entry }));
  }, []);

  const syncPlaylist = useCallback(async (playlistId: string) => {
    if (syncingRef.current.has(playlistId)) return;
    syncingRef.current.add(playlistId);
    setPlaylistProgress(playlistId, { syncing: true, error: null });

    try {
      const manifest = await playlistsApi.getManifest(playlistId);
      const downloadable = manifest.tracks.filter(isDownloadable);
      const existing = entriesRef.current[playlistId];
      const existingTracks = existing?.tracks ?? [];
      const existingById = new Map(existingTracks.map(t => [t.trackId, t]));
      const downloadableById = new Map(downloadable.map(t => [t.id, t]));

      // Anything on-device that's no longer in the downloadable set (removed
      // from the playlist, marked unavailable, or a re-download in progress
      // server-side) gets deleted before anything new is fetched, freeing
      // space up front rather than after.
      const toDelete = existingTracks.filter(t => !downloadableById.has(t.trackId));
      await Promise.all(toDelete.map(t => removeOfflineTrack(t)));

      // A track already on-device is re-downloaded if the underlying media
      // file actually changed (HQ rescan replaced it — same mediaFileId
      // means the bytes are identical, no point re-fetching) OR if its file
      // is simply gone despite the index saying otherwise (deleted by
      // another app, cleared by the OS, etc. — see offlineFileExists) —
      // otherwise the index would keep reporting a track as "downloaded"
      // forever even after it's no longer actually playable.
      const sameFileCandidates = existingTracks.filter(t => {
        const server = downloadableById.get(t.trackId);
        return server !== undefined && server.mediaFileId === t.mediaFileId;
      });
      const stillExists = await Promise.all(sameFileCandidates.map(t => offlineFileExists(t)));
      const unchanged = sameFileCandidates.filter((_, i) => stillExists[i]);
      const missingLocally = sameFileCandidates.filter((_, i) => !stillExists[i]);

      const toDownload = [
        ...downloadable.filter(t => {
          const have = existingById.get(t.id);
          return !have || have.mediaFileId !== t.mediaFileId;
        }),
        ...missingLocally.map(t => downloadableById.get(t.trackId)!),
      ];

      setPlaylistProgress(playlistId, { total: downloadable.length, completed: unchanged.length });

      const downloaded: OfflineTrackEntry[] = [...unchanged];
      let completed = unchanged.length;
      let sinceLastPersist = 0;
      let failures = 0;

      const flush = () => {
        persistEntry({
          playlistId,
          title: manifest.playlist.title,
          customName: manifest.playlist.customName,
          thumbnailUrl: manifest.playlist.thumbnailUrl,
          lastSyncedAt: manifest.playlist.lastSyncedAt,
          tracks: [...downloaded].sort((a, b) => a.position - b.position),
        });
      };

      await runWithConcurrency(toDownload, MAX_CONCURRENT_DOWNLOADS, async (track) => {
        try {
          const entry = await downloadTrack(playlistId, track);
          downloaded.push(entry);
        } catch {
          failures += 1;
        } finally {
          completed += 1;
          sinceLastPersist += 1;
          setPlaylistProgress(playlistId, { completed });
          if (sinceLastPersist >= PERSIST_EVERY) {
            sinceLastPersist = 0;
            flush();
          }
        }
      });

      flush();
      setPlaylistProgress(playlistId, {
        syncing: false,
        error: failures > 0 ? `${failures} track(s) failed to download` : null,
      });
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // Playlist no longer exists for this account — nothing sensible to
        // keep synced, so drop it from offline entirely.
        const existing = entriesRef.current[playlistId];
        if (existing) await Promise.all(existing.tracks.map(t => removeOfflineTrack(t)));
        await removeOfflinePlaylistDir(playlistId);
        offlineIndex.removePlaylist(playlistId);
        setEntries(prev => {
          const next = { ...prev };
          delete next[playlistId];
          return next;
        });
        setProgress(prev => {
          const next = { ...prev };
          delete next[playlistId];
          return next;
        });
      } else {
        // Most commonly: server unreachable — leave whatever's already on
        // disk untouched, just surface that this attempt didn't complete.
        setPlaylistProgress(playlistId, { syncing: false, error: 'sync-failed' });
      }
    } finally {
      syncingRef.current.delete(playlistId);
    }
  }, [persistEntry, setPlaylistProgress]);

  const enableOffline = useCallback(async (playlistId: string) => {
    if (entriesRef.current[playlistId]) return;
    // Seed an empty entry immediately so isEnabled()/the toggle reflect the
    // "on" state right away, before the first sync has fetched anything.
    persistEntry({
      playlistId, title: '', customName: null, thumbnailUrl: null, lastSyncedAt: null, tracks: [],
    });
    // Persists the toggle server-side (so a reinstall can restore it — see
    // the reconciliation effect below) and writes the admin-log entry;
    // never blocks the actual enable/sync below.
    playlistsApi.enableOfflineOnServer(playlistId).catch(() => {});
    await syncPlaylist(playlistId);
  }, [persistEntry, syncPlaylist]);

  const disableOffline = useCallback(async (playlistId: string) => {
    const existing = entriesRef.current[playlistId];
    if (existing) {
      await Promise.all(existing.tracks.map(t => removeOfflineTrack(t)));
    }
    await removeOfflinePlaylistDir(playlistId);
    offlineIndex.removePlaylist(playlistId);
    setEntries(prev => {
      const next = { ...prev };
      delete next[playlistId];
      return next;
    });
    setProgress(prev => {
      const next = { ...prev };
      delete next[playlistId];
      return next;
    });
    playlistsApi.disableOfflineOnServer(playlistId).catch(() => {});
  }, []);

  const isEnabled = useCallback((playlistId: string) => playlistId in entriesRef.current, []);

  const getLocalUri = useCallback((playlistId: string, trackId: string): string | undefined => {
    return entriesRef.current[playlistId]?.tracks.find(t => t.trackId === trackId)?.localUri;
  }, []);

  // Re-run every enabled playlist's sync — and flush any plays queued while
  // offline (see mobile/src/offline/playQueue.ts) — whenever the app comes
  // to the foreground or the device regains network. Both are the natural
  // "you're probably back in range of your server" signals, on top of
  // whatever a user-triggered manual sync (see the playlist screens) does.
  //
  // Also reconciles against the server's Playlist.offlineEnabled: a playlist
  // marked enabled there but missing from the local index (a fresh install,
  // or the same account on a replaced phone) gets re-enabled/re-downloaded
  // here automatically — this is the actual "survives losing the phone"
  // behavior, not just the toggle's own on-device state.
  useEffect(() => {
    const syncAll = async () => {
      try {
        const { playlists } = await playlistsApi.getAll();
        for (const p of playlists) {
          if (p.offlineEnabled && !entriesRef.current[p.id]) {
            enableOffline(p.id).catch(() => {});
          }
        }
      } catch {
        // Server unreachable — nothing to reconcile against right now;
        // whatever's already in the local index below still gets synced.
      }
      for (const playlistId of Object.keys(entriesRef.current)) {
        syncPlaylist(playlistId).catch(() => {});
      }
      flushPlayQueue().catch(() => {});
    };

    syncAll();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncAll();
    });
    let wasConnected = true;
    const netSub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      if (connected && !wasConnected) syncAll();
      wasConnected = connected;
    });

    return () => {
      appStateSub.remove();
      netSub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<OfflineDownloadsContextType>(() => ({
    entries, progress, isEnabled, getLocalUri, enableOffline, disableOffline, syncPlaylist,
  }), [entries, progress, isEnabled, getLocalUri, enableOffline, disableOffline, syncPlaylist]);

  return (
    <OfflineDownloadsContext.Provider value={value}>
      {children}
    </OfflineDownloadsContext.Provider>
  );
}

export function useOfflineDownloads(): OfflineDownloadsContextType {
  const ctx = useContext(OfflineDownloadsContext);
  if (!ctx) throw new Error('useOfflineDownloads must be used within OfflineDownloadsProvider');
  return ctx;
}
