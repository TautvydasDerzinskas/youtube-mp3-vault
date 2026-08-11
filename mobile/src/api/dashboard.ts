import client from './client';

export interface DashboardSong {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  playCount: number;
  lastPlayedAt: string | null;
}

export interface DashboardArtist {
  key: string;
  artist: string;
  songCount: number;
}

export interface DashboardGenre {
  key: string;
  genre: string;
  count: number;
}

export interface DashboardRecentTrack {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  addedAt: string;
  playlistName: string;
}

export interface DashboardSummary {
  playlistCount: number;
  totalSongCount: number;
  totalArtistCount: number;
  totalGenreCount: number;
  topSongs: DashboardSong[];
  topArtists: DashboardArtist[];
  topGenres: DashboardGenre[];
  recentlyAdded: DashboardRecentTrack[];
}

// Mirrors frontend/src/api/dashboard.ts — same endpoints, same response
// shapes (see backend/src/routes/dashboard.ts).
export const dashboardApi = {
  getSummary: async (): Promise<DashboardSummary> => {
    const { data } = await client.get<DashboardSummary>('/dashboard/summary');
    return data;
  },

  getAllSongs: async (): Promise<DashboardSong[]> => {
    const { data } = await client.get<{ songs: DashboardSong[] }>('/dashboard/songs');
    return data.songs;
  },

  getAllArtists: async (): Promise<DashboardArtist[]> => {
    const { data } = await client.get<{ artists: DashboardArtist[] }>('/dashboard/artists');
    return data.artists;
  },

  getAllGenres: async (): Promise<DashboardGenre[]> => {
    const { data } = await client.get<{ genres: DashboardGenre[] }>('/dashboard/genres');
    return data.genres;
  },
};
