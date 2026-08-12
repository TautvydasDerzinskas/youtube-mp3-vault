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
  // False from the moment a playlist is enabled/seeded until syncPlaylist's
  // download loop actually finishes (see OfflineDownloadsContext) — lets the
  // app-start reconciliation tell "first sync got interrupted by the app
  // being killed" apart from "fully synced, nothing changed since." Missing
  // entirely on entries written before this field existed, which is treated
  // as true (see OfflineDownloadsContext's isEntryComplete) since those were
  // all written by a version that only ever persisted a finished sync.
  syncComplete?: boolean;
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

// A single track named in one bucket of an OfflineDiff — just enough to
// render a compact list (see OfflineSyncDiffModal), not the full manifest/
// index shape either side of the comparison actually carries.
export interface OfflineDiffEntry {
  trackId: string;
  title: string;
}

// Read-only comparison of a playlist's on-device tracks against the
// server's current manifest — computed by OfflineDownloadsContext's
// computeDiff, purely for preview (see OfflineSyncDiffModal). Nothing is
// downloaded/deleted until the user reviews this and taps Proceed, which is
// the whole point: offline sync used to apply automatically on every app
// foreground/reconnect with no review step at all.
export interface OfflineDiff {
  // In the manifest but not on-device yet.
  added: OfflineDiffEntry[];
  // On-device but no longer in the manifest (removed from the playlist, or
  // marked unavailable server-side).
  removed: OfflineDiffEntry[];
  // On-device and still in the manifest, but the underlying file changed
  // (an HQ upgrade overwrote it — same mediaFileId, different fileSize; or
  // rarely a genuinely different mediaFileId) — or the on-device copy is
  // simply gone (deleted by the OS/another app) despite the index still
  // listing it. Either way the needed action is the same: fetch it again.
  updated: OfflineDiffEntry[];
}

export function isDiffEmpty(diff: OfflineDiff | undefined): boolean {
  return !diff || (diff.added.length === 0 && diff.removed.length === 0 && diff.updated.length === 0);
}
