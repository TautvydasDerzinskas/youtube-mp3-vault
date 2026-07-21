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
  artist: string;
  songCount: number;
}

export interface DashboardGenre {
  // Normalized (lowercased/trimmed) — use this for the ?genres= URL param,
  // not `genre`, which is just the display label.
  key: string;
  genre: string;
  count: number;
}

export interface DashboardSummary {
  playlistCount: number;
  totalSongCount: number;
  topSongs: DashboardSong[];
  topArtists: DashboardArtist[];
  topGenres: DashboardGenre[];
}

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
