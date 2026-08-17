import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { playlistsApi, ManifestTrack } from '../api/playlists';
import { offlineIndex } from './offlineIndex';
import {
  downloadTrack, removeOfflineTracks, removeOfflinePlaylistDir, removeAndroidOrphanAssets, offlineFileExists,
  runWithConcurrency, MAX_CONCURRENT_DOWNLOADS,
} from './downloader';
import { flushPlayQueue } from './playQueue';
import { OfflinePlaylistEntry, OfflineTrackEntry, OfflineProgress, OfflineDiff, isDiffEmpty } from './types';

export type { OfflinePlaylistEntry, OfflineTrackEntry, OfflineProgress, OfflineDiff, OfflineDiffEntry } from './types';
export { isOfflineSyncComplete, isDiffEmpty } from './types';

interface OfflineDownloadsContextType {
  // Every playlist the local index currently has an entry for — drives both
  // PlaylistRow's "offline" badge and OfflinePlaylistsScreen's list.
  entries: Record<string, OfflinePlaylistEntry>;
  progress: Record<string, OfflineProgress>;
  // Populated read-only, by refreshDiff below — an entry present here (and
  // non-empty, see isDiffEmpty) is what makes PlaylistRow show the "Sync
  // offline stored files" menu item at all. A playlist with nothing to
  // report is simply absent, not present-with-empty-arrays.
  diffs: Record<string, OfflineDiff>;
  isEnabled: (playlistId: string) => boolean;
  getLocalUri: (playlistId: string, trackId: string) => string | undefined;
  enableOffline: (playlistId: string) => Promise<void>;
  disableOffline: (playlistId: string) => Promise<void>;
  // Recomputes (read-only — no downloads/deletes) what's changed between
  // this playlist's on-device tracks and the server's current manifest.
  // Never called automatically for its own sake; see the foreground/
  // reconnect effect below for where it *is* called automatically, and
  // syncPlaylist's doc comment for why that's still fine.
  refreshDiff: (playlistId: string) => Promise<void>;
  // Actually applies a sync — downloads/deletes files to match the server
  // manifest. Only two callers: enableOffline (a playlist's first-ever
  // download, an explicit user action) and OfflineSyncDiffModal's Proceed
  // button (the user has just reviewed exactly what this will change).
  // Never called on a timer/foreground/reconnect for an already-enabled
  // playlist anymore — that used to silently add/remove on-device files
  // with no review step at all.
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

// Read-only counterpart to syncPlaylist's own diff logic below — same
// added/removed/changed-file reasoning, but only ever reads (a manifest
// fetch, a per-track disk-existence check for the "same file on both sides"
// case), never downloads or deletes anything. Kept as a separate,
// similarly-structured pass rather than a shared helper the two call into,
// since syncPlaylist needs the full ManifestTrack/OfflineTrackEntry objects
// to actually act on (mediaFileId, downloadUrl, etc.), while this only ever
// needs enough to render a compact "here's what changed" list.
//
// A manifest 404 (playlist deleted server-side) is treated as "everything
// on-device should be removed" rather than swallowed — syncPlaylist already
// knows how to fully retire a playlist on the same 404, so surfacing it here
// as an ordinary (if total) removed-list is what lets Proceed reach that
// path through the same review step as any other diff.
async function computeDiff(playlistId: string, existing: OfflinePlaylistEntry | undefined): Promise<OfflineDiff> {
  const existingTracks = existing?.tracks ?? [];

  let downloadable: ManifestTrack[];
  try {
    const manifest = await playlistsApi.getManifest(playlistId);
    downloadable = manifest.tracks.filter(isDownloadable);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return { added: [], removed: existingTracks.map(t => ({ trackId: t.trackId, title: t.title })), updated: [] };
    }
    throw err;
  }

  const existingById = new Map(existingTracks.map(t => [t.trackId, t]));
  const downloadableById = new Map(downloadable.map(t => [t.id, t]));

  const removed = existingTracks
    .filter(t => !downloadableById.has(t.trackId))
    .map(t => ({ trackId: t.trackId, title: t.title }));

  const added: OfflineDiff['added'] = [];
  const changed: OfflineTrackEntry[] = [];
  const sameFileCandidates: OfflineTrackEntry[] = [];

  for (const track of downloadable) {
    const have = existingById.get(track.id);
    if (!have) {
      added.push({ trackId: track.id, title: track.title });
    } else if (have.mediaFileId !== track.mediaFileId || have.fileSize !== track.fileSize) {
      changed.push(have);
    } else {
      sameFileCandidates.push(have);
    }
  }

  const stillExists = await Promise.all(sameFileCandidates.map(offlineFileExists));
  const missingLocally = sameFileCandidates.filter((_, i) => !stillExists[i]);

  const updated = [...changed, ...missingLocally].map(t => ({ trackId: t.trackId, title: t.title }));

  return { added, removed, updated };
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
//
// `isReachable` (from useServerReachability, hoisted to RootNavigator) gates
// the startup/foreground/reconnect reconciliation effect below entirely —
// see that effect for why: it's not just wasted 5s-timeout server calls
// while genuinely offline, it's the Android orphan-asset cleanup asking to
// delete files that only *look* orphaned because the local index can't be
// trusted as complete until the server confirms it.
export function OfflineDownloadsProvider({ children, isReachable }: { children: ReactNode; isReachable: boolean }) {
  const [entries, setEntries] = useState<Record<string, OfflinePlaylistEntry>>(() => offlineIndex.getAll().playlists);
  const [progress, setProgress] = useState<Record<string, OfflineProgress>>({});
  const [diffs, setDiffs] = useState<Record<string, OfflineDiff>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const syncingRef = useRef<Set<string>>(new Set());
  // Guards computeDiff the same way syncingRef guards syncPlaylist — the
  // foreground/reconnect/mount triggers below can otherwise overlap (e.g.
  // app foregrounded right as a reconnect event also fires) and race each
  // other's manifest fetches for no benefit.
  const diffingRef = useRef<Set<string>>(new Set());

  const setPlaylistProgress = useCallback((playlistId: string, patch: Partial<OfflineProgress>) => {
    setProgress(prev => ({
      ...prev,
      [playlistId]: { ...DEFAULT_PROGRESS, ...prev[playlistId], ...patch },
    }));
  }, []);

  const clearDiff = useCallback((playlistId: string) => {
    setDiffs(prev => {
      if (!(playlistId in prev)) return prev;
      const next = { ...prev };
      delete next[playlistId];
      return next;
    });
  }, []);

  // Read-only — see computeDiff's own doc comment above. Swallows errors
  // other than a 404 (which computeDiff itself already turns into a
  // "remove everything" diff) since this runs unattended on a timer/
  // foreground/reconnect basis: a transient network hiccup should just
  // leave whatever diff (or lack of one) was already showing, not clear it
  // out or throw somewhere nothing is watching for it.
  const refreshDiff = useCallback(async (playlistId: string) => {
    if (diffingRef.current.has(playlistId)) return;
    diffingRef.current.add(playlistId);
    try {
      const diff = await computeDiff(playlistId, entriesRef.current[playlistId]);
      if (isDiffEmpty(diff)) clearDiff(playlistId);
      else setDiffs(prev => ({ ...prev, [playlistId]: diff }));
    } catch {
      // Server unreachable or similar — leave the last-known diff as-is.
    } finally {
      diffingRef.current.delete(playlistId);
    }
  }, [clearDiff]);

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
      await removeOfflineTracks(toDelete);

      // A track already on-device is re-downloaded if the underlying media
      // file actually changed, or if its file is simply gone despite the
      // index saying otherwise (deleted by another app, cleared by the OS,
      // etc. — see offlineFileExists) — otherwise the index would keep
      // reporting a track as "downloaded" forever even after it's no longer
      // actually playable.
      //
      // "Changed" can't be detected from mediaFileId alone: an HQ upgrade
      // (see backend/src/services/hqReplace.ts's downloadAndReplace)
      // overwrites the shared mp3 in place — same MediaFile row, same id —
      // and only its fileSize/bitrate change. Without also comparing
      // fileSize, an on-device copy that predates an HQ upgrade would never
      // notice one happened and would stay stuck with the old, lower-
      // bitrate file indefinitely.
      const sameFileCandidates = existingTracks.filter(t => {
        const server = downloadableById.get(t.trackId);
        return server !== undefined && server.mediaFileId === t.mediaFileId && server.fileSize === t.fileSize;
      });
      const stillExists = await Promise.all(sameFileCandidates.map(t => offlineFileExists(t)));
      const unchanged = sameFileCandidates.filter((_, i) => stillExists[i]);
      const missingLocally = sameFileCandidates.filter((_, i) => !stillExists[i]);

      const toDownload = [
        ...downloadable.filter(t => {
          const have = existingById.get(t.id);
          return !have || have.mediaFileId !== t.mediaFileId || have.fileSize !== t.fileSize;
        }),
        ...missingLocally.map(t => downloadableById.get(t.trackId)!),
      ];

      setPlaylistProgress(playlistId, { total: downloadable.length, completed: unchanged.length });

      const downloaded: OfflineTrackEntry[] = [...unchanged];
      let completed = unchanged.length;
      let sinceLastPersist = 0;
      let failures = 0;
      // Android only: a re-download (HQ upgrade, or any other server-side
      // file change) always lands as a brand-new MediaLibrary asset with its
      // own assetId — the old asset is never implicitly replaced or freed,
      // it just falls out of the index once `downloaded` below replaces it.
      // Collected here and deleted in one batch after the loop, same reason
      // as removeOfflineTracks itself: deleting one-by-one as each track
      // finishes would mean one system delete-confirmation dialog per track.
      // Only collected on a *successful* re-download, so a failed one still
      // leaves the old, playable copy in place instead of a gap.
      // iOS doesn't need this — downloadTrack there writes to the same
      // fixed `${track.id}.mp3` path every time, so the old file is already
      // overwritten in place by the time this runs.
      const replacedOldAssets: OfflineTrackEntry[] = [];

      const flush = (complete: boolean) => {
        persistEntry({
          playlistId,
          title: manifest.playlist.title,
          customName: manifest.playlist.customName,
          thumbnailUrl: manifest.playlist.thumbnailUrl,
          lastSyncedAt: manifest.playlist.lastSyncedAt,
          tracks: [...downloaded].sort((a, b) => a.position - b.position),
          syncComplete: complete,
        });
      };

      await runWithConcurrency(toDownload, MAX_CONCURRENT_DOWNLOADS, async (track) => {
        try {
          const entry = await downloadTrack(playlistId, track);
          downloaded.push(entry);
          if (Platform.OS === 'android') {
            const have = existingById.get(track.id);
            if (have && (have.mediaFileId !== track.mediaFileId || have.fileSize !== track.fileSize)) {
              replacedOldAssets.push(have);
            }
          }
        } catch {
          failures += 1;
        } finally {
          completed += 1;
          sinceLastPersist += 1;
          setPlaylistProgress(playlistId, { completed });
          if (sinceLastPersist >= PERSIST_EVERY) {
            sinceLastPersist = 0;
            flush(false);
          }
        }
      });

      // The loop above ran to completion (as opposed to the app being killed
      // partway through) — mark the entry complete regardless of any
      // per-track failures, which surface via `error` instead; see
      // isEntryComplete/the startup reconciliation effect below for what
      // this gates. Flushed *before* removeOfflineTracks below, which can
      // sit awaiting a system delete-confirmation dialog for a while (or
      // indefinitely, if the app gets backgrounded/killed while it's up) —
      // every track is already durably downloaded at this point regardless
      // of whether that best-effort old-asset cleanup ever gets to run, so
      // completion shouldn't be hostage to it.
      flush(true);
      await removeOfflineTracks(replacedOldAssets);
      setPlaylistProgress(playlistId, {
        syncing: false,
        error: failures > 0 ? `${failures} track(s) failed to download` : null,
      });
      // On-device state now matches the manifest this sync just applied
      // (modulo any per-track failures above, which surface via `error`
      // rather than the diff) — whatever diff justified this run is settled.
      clearDiff(playlistId);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // Playlist no longer exists for this account — nothing sensible to
        // keep synced, so drop it from offline entirely.
        const existing = entriesRef.current[playlistId];
        if (existing) await removeOfflineTracks(existing.tracks);
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
        clearDiff(playlistId);
      } else {
        // Most commonly: server unreachable — leave whatever's already on
        // disk untouched, just surface that this attempt didn't complete.
        setPlaylistProgress(playlistId, { syncing: false, error: 'sync-failed' });
      }
    } finally {
      syncingRef.current.delete(playlistId);
    }
  }, [persistEntry, setPlaylistProgress, clearDiff]);

  const enableOffline = useCallback(async (playlistId: string) => {
    if (entriesRef.current[playlistId]) return;
    // Seed an empty entry immediately so isEnabled()/the toggle reflect the
    // "on" state right away, before the first sync has fetched anything.
    persistEntry({
      playlistId, title: '', customName: null, thumbnailUrl: null, lastSyncedAt: null, tracks: [],
      syncComplete: false,
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
      await removeOfflineTracks(existing.tracks);
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

  // Refreshes every already-enabled playlist's diff (read-only — see
  // computeDiff) — and flushes any plays queued while offline (see
  // mobile/src/offline/playQueue.ts) — whenever the app comes to the
  // foreground or the device regains network. Both are the natural "you're
  // probably back in range of your server" signals to go check, on top of
  // whatever a user-triggered manual sync (see OfflineSyncDiffModal) does.
  // This used to actually apply the diff (download/delete files) right
  // here, with no review step — see syncPlaylist's own doc comment on the
  // context type for why that changed.
  //
  // Still reconciles against the server's Playlist.offlineEnabled: a
  // playlist marked enabled there but entirely missing from the local index
  // (a fresh install, or the same account on a replaced phone) gets
  // enabled/downloaded here automatically — this is the actual "survives
  // losing the phone" behavior, not just the toggle's own on-device state,
  // and it's a first-time download rather than silently changing anything
  // already on-device, so it stays automatic.
  const orphanCleanupDoneRef = useRef(false);

  useEffect(() => {
    // Nothing in here should run until the backend is confirmed reachable:
    // the server reconciliation obviously needs it, but so — less obviously
    // — does the orphan cleanup below, even though it's a purely local
    // comparison. `entriesRef.current` can only be trusted as a complete
    // picture of "what's genuinely downloaded" once any playlist stuck
    // mid-sync (syncComplete: false) has had a real chance to finish or
    // resume against the server; treating it as complete while still
    // offline risks flagging perfectly valid, already-downloaded assets as
    // orphans and prompting to delete them, every single offline launch,
    // for as long as that entry stays stuck. Effect re-runs (and, the first
    // time this session, finally runs the once-only orphan cleanup) the
    // moment isReachable flips true.
    if (!isReachable) return;

    const refreshAll = async () => {
      // Only on this effect's very first run (app startup), and strictly
      // before anything below can create a new asset — see
      // removeAndroidOrphanAssets for why the ordering matters.
      if (!orphanCleanupDoneRef.current) {
        orphanCleanupDoneRef.current = true;
        const knownAssetIds = new Set<string>();
        for (const entry of Object.values(entriesRef.current)) {
          for (const t of entry.tracks) {
            if (t.assetId) knownAssetIds.add(t.assetId);
          }
        }
        // Assets created just before a previous session was killed mid-sync
        // may not have made it into any entry's tracks above yet — see
        // PENDING_ASSETS_FILE in offlineIndex.ts.
        for (const id of offlineIndex.getPendingAssetIds()) knownAssetIds.add(id);
        await removeAndroidOrphanAssets(knownAssetIds);
      }
      try {
        const { playlists } = await playlistsApi.getAll();
        for (const p of playlists) {
          if (p.offlineEnabled && !entriesRef.current[p.id]) {
            enableOffline(p.id).catch(() => {});
          }
        }
      } catch {
        // Server unreachable — nothing to reconcile against right now;
        // whatever's already in the local index below still gets diffed.
      }
      for (const playlistId of Object.keys(entriesRef.current)) {
        const entry = entriesRef.current[playlistId];
        // syncComplete === false means this entry's sync was still running
        // when the app last stopped (killed mid-download, not a normal
        // background/quit) — resume it directly rather than just diffing,
        // otherwise it sits "enabled" with no further progress forever (the
        // diff against its own incomplete track list would undercount what's
        // actually missing, and nothing else ever re-invokes syncPlaylist for
        // an entry that already exists). Missing entirely (entries written
        // before this field existed) reads as complete — see types.ts.
        if (entry && entry.syncComplete === false) {
          syncPlaylist(playlistId).catch(() => {});
        } else {
          refreshDiff(playlistId).catch(() => {});
        }
      }
      flushPlayQueue().catch(() => {});
    };

    refreshAll();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAll();
    });
    let wasConnected = true;
    const netSub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected;
      if (connected && !wasConnected) refreshAll();
      wasConnected = connected;
    });

    return () => {
      appStateSub.remove();
      netSub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReachable]);

  const value = useMemo<OfflineDownloadsContextType>(() => ({
    entries, progress, diffs, isEnabled, getLocalUri, enableOffline, disableOffline, refreshDiff, syncPlaylist,
  }), [entries, progress, diffs, isEnabled, getLocalUri, enableOffline, disableOffline, refreshDiff, syncPlaylist]);

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
