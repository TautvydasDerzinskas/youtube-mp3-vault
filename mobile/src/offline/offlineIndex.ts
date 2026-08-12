import { File, Paths } from 'expo-file-system';
import { OfflineIndexData, OfflinePlaylistEntry } from './types';

// A single JSON file at the document root tracks every offline-enabled
// playlist and what's been downloaded for it — the "database" for this
// whole feature. Kept as one small file rather than one-file-per-playlist
// since even at 1500+ tracks per playlist the metadata here (no binary data,
// just ids/titles/uris) stays well under a size where a single read/write
// is a bottleneck, and one file means one place that can get corrupted
// instead of many.
const INDEX_FILE = new File(Paths.document, 'offline-index.json');

// In-memory cache — every caller in a given app session goes through the
// same module instance, so this avoids re-reading/re-parsing the file on
// every single lookup (e.g. once per track row) while still being the
// single source of truth on disk across app restarts.
let cache: OfflineIndexData | null = null;

function readIndex(): OfflineIndexData {
  if (cache) return cache;
  if (!INDEX_FILE.exists) {
    cache = { playlists: {} };
    return cache;
  }
  try {
    cache = JSON.parse(INDEX_FILE.textSync()) as OfflineIndexData;
  } catch {
    // Corrupt/unreadable index — treat as empty rather than crashing the
    // whole offline feature; worst case is a full re-download.
    cache = { playlists: {} };
  }
  return cache;
}

function writeIndex(data: OfflineIndexData): void {
  cache = data;
  INDEX_FILE.write(JSON.stringify(data));
}

// Deliberately a separate, tiny file rather than a field on the main index:
// downloader.ts appends to this once per Android asset actually created,
// which needs to be cheap enough to do on every single track — writing the
// *whole* index that often would mean re-serializing every playlist's full
// track list per track downloaded (see OfflineDownloadsContext's
// PERSIST_EVERY comment for why that's avoided there). This file only ever
// holds bare asset ids, so it stays small even mid-sync.
//
// Exists to close a race in removeAndroidOrphanAssets (downloader.ts): that
// startup cleanup treats anything in the shared album not listed in the main
// index's tracks as an orphan to delete. Without this, an asset created just
// before the app got killed — but not yet covered by the main index's own
// batched flush — would be misidentified as an orphan and deleted (and the
// user prompted to confirm) on the very next launch, even though it's a
// perfectly good, already-synced file. clearPendingAssets prunes an id back
// out the moment the main index's own flush catches up and covers it.
const PENDING_ASSETS_FILE = new File(Paths.document, 'offline-pending-assets.json');
let pendingCache: string[] | null = null;

function readPending(): string[] {
  if (pendingCache) return pendingCache;
  if (!PENDING_ASSETS_FILE.exists) {
    pendingCache = [];
    return pendingCache;
  }
  try {
    pendingCache = JSON.parse(PENDING_ASSETS_FILE.textSync()) as string[];
  } catch {
    pendingCache = [];
  }
  return pendingCache;
}

function writePending(ids: string[]): void {
  pendingCache = ids;
  PENDING_ASSETS_FILE.write(JSON.stringify(ids));
}

export const offlineIndex = {
  getAll(): OfflineIndexData {
    return readIndex();
  },

  getPlaylist(playlistId: string): OfflinePlaylistEntry | undefined {
    return readIndex().playlists[playlistId];
  },

  listEnabledPlaylistIds(): string[] {
    return Object.keys(readIndex().playlists);
  },

  setPlaylist(entry: OfflinePlaylistEntry): void {
    const data = readIndex();
    data.playlists = { ...data.playlists, [entry.playlistId]: entry };
    writeIndex(data);
    // This entry's own tracks are now durably covered by the main index, so
    // any pending markers for them are redundant — see PENDING_ASSETS_FILE.
    const flushedIds = entry.tracks.map(t => t.assetId).filter((id): id is string => !!id);
    if (flushedIds.length) offlineIndex.clearPendingAssets(flushedIds);
  },

  removePlaylist(playlistId: string): void {
    const data = readIndex();
    if (!(playlistId in data.playlists)) return;
    const playlists = { ...data.playlists };
    delete playlists[playlistId];
    writeIndex({ ...data, playlists });
  },

  addPendingAsset(assetId: string): void {
    const ids = readPending();
    if (ids.includes(assetId)) return;
    writePending([...ids, assetId]);
  },

  getPendingAssetIds(): string[] {
    return readPending();
  },

  clearPendingAssets(assetIds: string[]): void {
    const toRemove = new Set(assetIds);
    const ids = readPending();
    const next = ids.filter(id => !toRemove.has(id));
    if (next.length !== ids.length) writePending(next);
  },
};
