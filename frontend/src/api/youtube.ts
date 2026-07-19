import client from './client';

export interface Playlist {
  id: string;
  youtubeId: string;
  title: string;
  customName: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
  downloadedCount: number;
  failedCount: number;
  totalSize: number;
  syncStatus: 'idle' | 'syncing' | 'error';
  syncPaused: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  currentVideo: { title: string; position: number } | null;
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
  // Zero or more tags — a broad parent genre like "Electronic" covers wildly
  // different-sounding music, so a track can carry more than one (a genuine
  // Electronic/Hip Hop hybrid, say) plus a specific style. Empty, not absent,
  // when nothing's been determined yet.
  genres: string[];
  releaseYear: number | null;
  metadataStatus: 'pending' | 'found' | 'not_found' | 'error';
}

// "Sounds like this" — ranked by Essentia audio-embedding cosine similarity
// (see backend/src/routes/youtube.ts), not genre matching. Spans every
// playlist the user owns, not just the one the source track is in — hence
// playlistId is included, to link into that track's own detail page.
export interface RecommendedTrack {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  genres: string[];
  thumbnailUrl: string | null;
  duration: number | null;
  similarity: number;
}

// A YouTube search result, never downloaded — just a link out. See
// searchRemixes in backend/src/services/youtube.ts for the dedup logic.
export interface RemixResult {
  id: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

export const playlistsApi = {
  getAll: async (): Promise<{ playlists: Playlist[] }> => {
    const { data } = await client.get<{ playlists: Playlist[] }>('/playlists');
    return data;
  },

  getOne: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.get<{ playlist: Playlist }>(`/playlists/${id}`);
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
    const { data } = await client.patch<{ playlist: Playlist }>(`/playlists/${id}`, {
      customName,
    });
    return data;
  },

  getVideos: async (id: string): Promise<{ videos: PlaylistVideo[] }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[] }>(`/playlists/${id}/videos`);
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

  getRemixes: async (playlistId: string, videoId: string): Promise<{ remixes: RemixResult[] }> => {
    const { data } = await client.get<{ remixes: RemixResult[] }>(`/playlists/${playlistId}/videos/${videoId}/remixes`);
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

  pause: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/pause`);
    return data;
  },

  resume: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/resume`);
    return data;
  },

  downloadUrl: (playlistId: string, videoId: string): string =>
    `/api/playlists/${playlistId}/videos/${videoId}/download`,

  streamUrl: (playlistId: string, videoId: string): string =>
    `/api/playlists/${playlistId}/videos/${videoId}/stream`,

  remove: async (id: string): Promise<void> => {
    await client.delete(`/playlists/${id}`);
  },
};
