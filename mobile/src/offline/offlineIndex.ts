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
  },

  removePlaylist(playlistId: string): void {
    const data = readIndex();
    if (!(playlistId in data.playlists)) return;
    const playlists = { ...data.playlists };
    delete playlists[playlistId];
    writeIndex({ ...data, playlists });
  },
};
