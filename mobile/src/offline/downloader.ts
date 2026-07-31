import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { getDownloadSource, ManifestTrack } from '../api/playlists';
import { OfflineTrackEntry } from './types';

// Android: saved into the device's shared Music library via
// expo-media-library, so any other music app/file manager can see and play
// these files too (see MEMORY/plan discussion — this is the whole reason
// for going through MediaLibrary instead of plain app-sandbox storage).
// iOS has no equivalent shared-audio-library API (apps are sandboxed;
// there's no MediaStore-style cross-app index), so files there just live in
// this app's Documents directory with file sharing enabled (see app.json's
// UIFileSharingEnabled/LSSupportsOpeningDocumentsInPlace) — visible in the
// Files app, but not auto-discovered by other music apps the way Android's
// copy is.
const ANDROID_ALBUM_NAME = 'YoutubeVault';
export const MAX_CONCURRENT_DOWNLOADS = 3;

function iosPlaylistDir(playlistId: string): Directory {
  const dir = new Directory(Paths.document, 'offline', playlistId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

let androidPermissionPromise: Promise<boolean> | null = null;

// Requests just the 'audio' granular permission (see app.json's
// expo-media-library plugin config, which limits the Android manifest to
// READ_MEDIA_AUDIO for the same reason) — cached for the app session so
// each track download doesn't re-prompt/re-check.
export function ensureAndroidMediaPermission(): Promise<boolean> {
  if (!androidPermissionPromise) {
    androidPermissionPromise = (async () => {
      const current = await MediaLibrary.getPermissionsAsync(true, ['audio']);
      if (current.status === 'granted') return true;
      const requested = await MediaLibrary.requestPermissionsAsync(true, ['audio']);
      return requested.status === 'granted';
    })();
  }
  return androidPermissionPromise;
}

async function addToAndroidAlbum(asset: MediaLibrary.Asset): Promise<void> {
  const existing = await MediaLibrary.Album.get(ANDROID_ALBUM_NAME);
  if (existing) {
    await existing.add(asset);
  } else {
    // Album.create both creates the album and moves/copies the asset into
    // it in one call — there's no way to pre-create an empty album since
    // it requires at least one asset up front.
    await MediaLibrary.Album.create(ANDROID_ALBUM_NAME, [asset]);
  }
}

interface DownloadTrackOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

// Downloads one manifest track's mp3 and saves it using the current
// platform's shared-vs-sandboxed strategy, returning the index entry to
// persist. Throws on failure (network error, disk full, permission denied)
// — callers are expected to catch per-track so one bad track doesn't abort
// an entire playlist sync.
export async function downloadTrack(
  playlistId: string,
  track: ManifestTrack,
  { onProgress, signal }: DownloadTrackOptions = {}
): Promise<OfflineTrackEntry> {
  const source = await getDownloadSource(playlistId, track.id);

  const base: Omit<OfflineTrackEntry, 'localUri' | 'assetId'> = {
    trackId: track.id,
    youtubeId: track.youtubeId,
    mediaFileId: track.mediaFileId,
    fileSize: track.fileSize,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    thumbnailUrl: track.thumbnailUrl,
    position: track.position,
  };

  if (Platform.OS === 'android') {
    const granted = await ensureAndroidMediaPermission();
    if (!granted) throw new Error('Media library permission denied');

    // Land the download in cache first (app-private, no permission needed),
    // then hand it to MediaLibrary — Asset.create's own move/copy behavior
    // into the shared store isn't guaranteed to leave the source alone, so
    // the temp file is cleaned up afterwards regardless (best-effort).
    const temp = new File(Paths.cache, `offline-dl-${track.id}-${Date.now()}.mp3`);
    const task = File.createDownloadTask(source.uri, temp, {
      headers: source.headers,
      signal,
      onProgress: onProgress ? ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
      } : undefined,
    });
    await task.downloadAsync();

    const asset = await MediaLibrary.Asset.create(temp.uri);
    await addToAndroidAlbum(asset);
    try {
      if (temp.exists) temp.delete();
    } catch {
      // Best-effort cleanup — a leftover cache file isn't harmful.
    }

    const localUri = await asset.getUri();
    return { ...base, localUri, assetId: asset.id };
  }

  const destination = new File(iosPlaylistDir(playlistId), `${track.id}.mp3`);
  // createDownloadTask has no `idempotent` option (unlike the one-shot
  // File.downloadFileAsync) — a stale file from a previous interrupted
  // attempt is removed up front instead, so re-syncing never hits a
  // destination-already-exists error.
  if (destination.exists) destination.delete();
  const task = File.createDownloadTask(source.uri, destination, {
    headers: source.headers,
    signal,
    onProgress: onProgress ? ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
    } : undefined,
  });
  const file = await task.downloadAsync();
  return { ...base, localUri: (file ?? destination).uri };
}

// Verifies a previously-downloaded track's file/asset is actually still on
// disk — the local index only records what *was* downloaded, and can go
// stale if something outside this app removed it (Android's copy is a
// normal file in the shared Music library, writable/deletable by any other
// app or the user via a file manager/gallery app; iOS storage can also be
// cleared by the OS under disk pressure). Called before trusting an
// "unchanged, skip re-download" decision during sync (see
// OfflineDownloadsContext.syncPlaylist) — without this, a deleted file would
// keep reading as "downloaded" indefinitely and playback would just fail.
export async function offlineFileExists(entry: OfflineTrackEntry): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      if (!entry.assetId) return false;
      // Throws if the asset no longer exists in the MediaStore.
      await new MediaLibrary.Asset(entry.assetId).getInfo();
      return true;
    }
    return new File(entry.localUri).exists;
  } catch {
    return false;
  }
}

// Removes one previously-downloaded track's local file/asset. Swallows
// errors — the file may already be gone (user deleted it via a file manager
// or gallery app, since Android's copy is genuinely shared/writable by
// other apps), and a reconcile pass should still be able to drop the index
// entry regardless.
export async function removeOfflineTrack(entry: OfflineTrackEntry): Promise<void> {
  try {
    if (Platform.OS === 'android' && entry.assetId) {
      await MediaLibrary.Asset.delete([new MediaLibrary.Asset(entry.assetId)]);
    } else {
      const file = new File(entry.localUri);
      if (file.exists) file.delete();
    }
  } catch {
    // Already gone or inaccessible — nothing more to do.
  }
}

export async function removeOfflinePlaylistDir(playlistId: string): Promise<void> {
  if (Platform.OS === 'android') return; // Nothing playlist-scoped to remove — assets live in the shared album.
  try {
    const dir = new Directory(Paths.document, 'offline', playlistId);
    if (dir.exists) dir.delete();
  } catch {
    // Non-fatal — individual track deletes already ran.
  }
}

// Runs `worker` over `items` with at most `concurrency` in flight at once —
// hand-rolled rather than pulling in a queue library, since this is the only
// place that needs it and the whole point of limiting concurrency here is
// just "don't open 1500 simultaneous connections," not fair scheduling or
// prioritization.
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}
