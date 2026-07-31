import client from './client';
import { tokenStorage } from '../auth/tokenStorage';

export interface Playlist {
  id: string;
  youtubeId: string | null;
  title: string;
  customName: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
  downloadedCount: number;
  failedCount: number;
  totalSize: number;
  totalDurationSec: number;
  syncStatus: 'idle' | 'syncing' | 'retrying' | 'generating' | 'error';
  syncPaused: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  currentVideo: { title: string; position: number } | null;
  isPacing: boolean;
  syncPhase: { phase: 'metadata' | 'quality'; current: number; total: number; title: string } | null;
  sourcePlaylistId: string | null;
  sourcePlaylistName: string | null;
}

export interface PlaylistVideo {
  id: string;
  youtubeId: string;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  position: number;
  isAvailable: boolean;
  downloadStatus: 'pending' | 'downloading' | 'done' | 'failed' | 'removed';
  downloadError: string | null;
  fileSize: number | null;
  bitrate: number | null;
  addedAt: string;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  genres: string[];
  releaseYear: number | null;
  metadataStatus: 'pending' | 'found' | 'not_found' | 'error';
  playCount: number;
  lastPlayedAt: string | null;
  betterQualityExists: boolean;
  hqFileDownloaded: boolean;
  playlistId?: string;
}

// Shapes for GET /playlists/:id/manifest — see backend/src/routes/youtube.ts's
// MANIFEST_TRACK_SELECT/handler. Deliberately a separate (slimmer) type from
// PlaylistVideo/Playlist above rather than reusing them: the manifest is the
// one endpoint the offline-download feature (see mobile/src/offline/) polls
// repeatedly to diff against what's already on-device, so its shape is
// pinned to exactly what that diff needs (includes tracks regardless of
// isAvailable, unlike getVideos).
export interface ManifestTrack {
  id: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  genres: string[];
  releaseYear: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
  position: number;
  addedAt: string;
  downloadStatus: 'pending' | 'downloading' | 'done' | 'failed' | 'removed';
  mediaFileId: string | null;
  fileSize: number | null;
  bitrate: number | null;
  downloadUrl: string | null;
}

export interface PlaylistManifest {
  playlist: {
    id: string;
    title: string;
    customName: string | null;
    thumbnailUrl: string | null;
    videoCount: number;
    downloadedCount: number;
    failedCount: number;
    totalSize: number;
    lastSyncedAt: string | null;
  };
  tracks: ManifestTrack[];
}

// Mirrors backend/src/routes/youtube.ts's PlaySyncEntry — one queued play
// event, with the client's own record of when it actually happened
// (playedAt, unix ms) rather than relying on server "now" at sync time.
export interface PlaySyncEntry {
  playlistId: string;
  videoId: string;
  playedAt: number;
}

export interface RecommendedTrack {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  genres: string[];
  thumbnailUrl: string | null;
  duration: number | null;
  playCount: number;
  similarity: number;
}

// Mirrors frontend/src/api/youtube.ts's playlistsApi — same endpoints/shapes
// (see backend/src/routes/youtube.ts). discover/remixes/usedIn are ported
// for type parity but have no mobile UI yet (see TrackDetailScreen).
export const playlistsApi = {
  getAll: async (): Promise<{ playlists: Playlist[] }> => {
    const { data } = await client.get<{ playlists: Playlist[] }>('/playlists');
    return data;
  },

  getOne: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.get<{ playlist: Playlist }>(`/playlists/${id}`);
    return data;
  },

  // Every song across every playlist the user has — each row carries its
  // own playlistId, since (unlike getVideos) this doesn't belong to just one.
  getAllTracks: async (): Promise<{ videos: PlaylistVideo[]; songCount: number; totalDurationSec: number }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[]; songCount: number; totalDurationSec: number }>(
      '/playlists/all-tracks'
    );
    return data;
  },

  // Just the numbers the pinned "All Tracks" row at the bottom of the
  // playlists list needs — avoids pulling every video's full metadata just
  // to render that summary.
  getAllTracksSummary: async (): Promise<{ songCount: number; totalDurationSec: number; totalSize: number }> => {
    const { data } = await client.get<{ songCount: number; totalDurationSec: number; totalSize: number }>(
      '/playlists/all-tracks/summary'
    );
    return data;
  },

  add: async (url: string, customName?: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>('/playlists', {
      url,
      customName: customName || undefined,
    });
    return data;
  },

  rename: async (id: string, customName: string | null): Promise<{ playlist: Playlist }> => {
    const { data } = await client.patch<{ playlist: Playlist }>(`/playlists/${id}`, { customName });
    return data;
  },

  getVideos: async (id: string): Promise<{ videos: PlaylistVideo[] }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[] }>(`/playlists/${id}/videos`);
    return data;
  },

  getManifest: async (id: string): Promise<PlaylistManifest> => {
    const { data } = await client.get<PlaylistManifest>(`/playlists/${id}/manifest`);
    return data;
  },

  getVideo: async (playlistId: string, videoId: string): Promise<{ video: PlaylistVideo }> => {
    const { data } = await client.get<{ video: PlaylistVideo }>(`/playlists/${playlistId}/videos/${videoId}`);
    return data;
  },

  getRecommendations: async (playlistId: string, videoId: string): Promise<{ recommendations: RecommendedTrack[] }> => {
    const { data } = await client.get<{ recommendations: RecommendedTrack[] }>(
      `/playlists/${playlistId}/videos/${videoId}/recommendations`
    );
    return data;
  },

  // Bulk-reports plays via mobile/src/offline/playQueue.ts's queue rather
  // than a single-track played endpoint — every play (online or offline) goes
  // through the same queue+flush path, so playCount/lastPlayedAt and Last.fm
  // scrobbles carry the real playedAt instead of "whenever this request
  // happens to land" (see backend/src/routes/youtube.ts's plays/sync route).
  syncPlays: async (plays: PlaySyncEntry[]): Promise<{ synced: number }> => {
    const { data } = await client.post<{ synced: number }>('/playlists/plays/sync', { plays });
    return data;
  },

  sync: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/sync`);
    return data;
  },

  retryFailed: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/retry-failed`);
    return data;
  },

  scanHq: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/scan-hq`);
    return data;
  },

  pause: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/pause`);
    return data;
  },

  resume: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/resume`);
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await client.delete(`/playlists/${id}`);
  },

  generateSimilar: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/generate-similar`);
    return data;
  },
};

// Unlike web (relative "/api/..." paths resolved against the page's own
// origin), mobile's client.defaults.baseURL is itself a full absolute URL
// the user configured (see ServerConfigContext) — so the stream URL has to
// be built as an absolute URL here rather than a bare path.
function streamUrl(playlistId: string, videoId: string): string {
  return `${client.defaults.baseURL}/playlists/${playlistId}/videos/${videoId}/stream`;
}

// expo-audio's AudioSource accepts { uri, headers } directly, and the
// backend's /stream route accepts a Bearer header as a fallback to its
// primary cookie-based auth (see backend/src/middleware/auth.ts extractToken)
// — so streaming can be authenticated the same way every other mobile API
// call already is, no signed-URL/query-param workaround needed.
export async function getStreamSource(playlistId: string, videoId: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await tokenStorage.get();
  return {
    uri: streamUrl(playlistId, videoId),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

// Same absolute-URL-plus-Bearer-header pattern as getStreamSource above, but
// for the permanent (non-range) /download route — this is what the offline
// downloader (mobile/src/offline/) fetches into a local/shared file. Built
// from playlistId/videoId directly rather than trusting ManifestTrack.downloadUrl
// as-is, since that path already includes a leading "/api" segment that
// would double up against client.defaults.baseURL (which itself ends in "/api").
export async function getDownloadSource(playlistId: string, videoId: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await tokenStorage.get();
  return {
    uri: `${client.defaults.baseURL}/playlists/${playlistId}/videos/${videoId}/download`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
