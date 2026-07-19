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
  genre: string | null;
  releaseYear: number | null;
  metadataStatus: 'pending' | 'found' | 'not_found' | 'error';
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
