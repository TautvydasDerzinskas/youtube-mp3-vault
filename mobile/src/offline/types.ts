// Shared shapes for the offline-download feature (mobile/src/offline/) — see
// offlineIndex.ts (persistence), downloader.ts (platform-specific
// download/storage), OfflineDownloadsContext.tsx (sync engine + public API).

// One row per track that has actually been saved to the device. Deliberately
// carries its own copy of display metadata (title/artist/thumbnail/etc.)
// rather than just an id, since the whole point of this store is to remain
// usable with zero network access — OfflinePlaylistsScreen/
// OfflinePlaylistDetailScreen render straight from this, never from
// playlistsApi.
export interface OfflineTrackEntry {
  trackId: string;
  youtubeId: string;
  mediaFileId: string | null;
  fileSize: number | null;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  position: number;
  // Playable URI for expo-audio: a file:// path on iOS, or a MediaLibrary
  // content:// asset URI on Android (see downloader.ts for why the two
  // platforms diverge here).
  localUri: string;
  // Android-only — the MediaLibrary asset id, needed to delete the shared
  // asset later (see downloader.ts's removeTrack). Absent on iOS, where
  // localUri already points at a file this app owns outright.
  assetId?: string;
}

export interface OfflinePlaylistEntry {
  playlistId: string;
  title: string;
  customName: string | null;
  thumbnailUrl: string | null;
  lastSyncedAt: string | null;
  // Present once toggled on; sync/reconcile runs keep this list in step with
  // the server's manifest (tracks added → downloaded, tracks removed/no
  // longer available → deleted from disk and dropped from this array).
  tracks: OfflineTrackEntry[];
}

export interface OfflineIndexData {
  playlists: Record<string, OfflinePlaylistEntry>;
}

export interface OfflineProgress {
  // Total tracks the current manifest says should be on-device (playable
  // ones only — see downloader.ts's isDownloadable).
  total: number;
  completed: number;
  syncing: boolean;
  error: string | null;
}

// Shared by PlaylistRow's badge and Header's offline section — "complete"
// means every track the last successful manifest fetch knew about is on
// disk, not just "not currently syncing" (a fresh sync-failed attempt or an
// empty/never-synced entry shouldn't read as done).
export function isOfflineSyncComplete(progress: OfflineProgress | undefined): boolean {
  return !!progress && !progress.syncing && !progress.error && progress.total > 0 && progress.completed >= progress.total;
}
