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
  // Bumped by markPlayed() below whenever this track finishes playing
  // naturally — internal listening stats, independent of Last.fm
  // scrobbling. No UI consumes these yet.
  playCount: number;
  lastPlayedAt: string | null;
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

// "You might also like", sourced from Last.fm (outside the local library —
// see /recommendations for the in-library equivalent). youtubeId is a
// best-guess match resolved server-side and may be null if nothing was
// found; spotifySearchUrl is always present since it's just a constructed
// deep link, no API/auth needed to build it.
export interface DiscoverResult {
  artist: string;
  title: string;
  matchScore: number;
  youtubeId: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  spotifySearchUrl: string;
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

  // Called once a track finishes playing naturally — bumps its internal play
  // count and, if the user has scrobbling on, best-effort scrobbles to
  // Last.fm server-side. See PlayerContext's handleTrackEnded.
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
};
