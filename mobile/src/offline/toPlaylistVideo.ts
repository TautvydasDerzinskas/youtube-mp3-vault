import { PlaylistVideo } from '../api/playlists';
import { OfflineTrackEntry } from './types';

// Adapts a locally-downloaded track into the same PlaylistVideo shape the
// rest of the app (PlayerContext, TrackRow-style rows) already expects, so
// OfflinePlaylistDetailScreen's queue can be handed to handleTogglePlay
// without either of them needing an offline-specific code path. Fields with
// no on-device equivalent (genres, playCount, addedAt, ...) get inert
// defaults — safe since none of the offline screens read them.
export function toPlaylistVideo(entry: OfflineTrackEntry, playlistId: string): PlaylistVideo {
  return {
    id: entry.trackId,
    youtubeId: entry.youtubeId,
    title: entry.title,
    duration: entry.duration,
    thumbnailUrl: entry.thumbnailUrl,
    position: entry.position,
    isAvailable: true,
    downloadStatus: 'done',
    downloadError: null,
    fileSize: entry.fileSize,
    bitrate: null,
    addedAt: '',
    artist: entry.artist,
    album: entry.album,
    trackNumber: null,
    genres: [],
    releaseYear: null,
    metadataStatus: 'found',
    playCount: 0,
    lastPlayedAt: null,
    betterQualityExists: false,
    hqFileDownloaded: false,
    playlistId,
  };
}
