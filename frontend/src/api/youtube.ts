import client from './client';

export interface Playlist {
  id: string;
  // Null only for a generated ("similar playlist") entry — see sourcePlaylistId.
  youtubeId: string | null;
  title: string;
  customName: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
  downloadedCount: number;
  failedCount: number;
  totalSize: number;
  syncStatus: 'idle' | 'syncing' | 'retrying' | 'generating' | 'error';
  syncPaused: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  currentVideo: { title: string; position: number } | null;
  // Set only on a generated playlist — the source it was generated from
  // (sourcePlaylistName is a snapshot, so it survives the source being
  // renamed or deleted later).
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

export interface DiscoverResult {
  artist: string;
  title: string;
  matchScore: number;
  youtubeId: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  spotifySearchUrl: string;
}

export interface UsedInPlaylist {
  id: string;
  title: string;
  thumbnailUrl: string | null;
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

  getDiscover: async (playlistId: string, videoId: string): Promise<{ enabled: boolean; discover: DiscoverResult[] }> => {
    const { data } = await client.get<{ enabled: boolean; discover: DiscoverResult[] }>(
      `/playlists/${playlistId}/videos/${videoId}/discover`
    );
    return data;
  },

  getUsedIn: async (playlistId: string, videoId: string): Promise<{ usedIn: UsedInPlaylist[] }> => {
    const { data } = await client.get<{ usedIn: UsedInPlaylist[] }>(`/playlists/${playlistId}/videos/${videoId}/used-in`);
    return data;
  },

  markPlayed: async (playlistId: string, videoId: string): Promise<{ playCount: number; lastPlayedAt: string }> => {
    const { data } = await client.post<{ playCount: number; lastPlayedAt: string }>(
      `/playlists/${playlistId}/videos/${videoId}/played`
    );
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

  generateSimilar: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/generate-similar`);
    return data;
  },
};
