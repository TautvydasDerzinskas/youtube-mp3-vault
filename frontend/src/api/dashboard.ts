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

export interface DashboardSummary {
  playlistCount: number;
  topSongs: DashboardSong[];
  topArtists: DashboardArtist[];
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
};
