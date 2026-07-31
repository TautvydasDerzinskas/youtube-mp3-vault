import client from './client';
import { PlaylistVideo } from './playlists';

// Mirrors frontend/src/api/artists.ts — same endpoints/shapes (see
// backend/src/routes/artists.ts). Same {key, genre, count} shape as
// DashboardGenre, not genreFilter's differently-shaped {key, label, count}.
export interface ArtistGenreCount {
  key: string;
  genre: string;
  count: number;
}

export interface ArtistSummary {
  key: string;
  name: string;
  songCount: number;
  totalPlayCount: number;
  thumbnailUrl: string | null;
}

export interface ArtistPlaylistRef {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface ArtistDetail {
  key: string;
  name: string;
  thumbnailUrl: string | null;
  // Last.fm bio, if one was ever successfully fetched — see backend's
  // getOrFetchArtistInfo. Null while offline/unconfigured on a first-ever
  // visit, or if Last.fm genuinely has nothing for this artist.
  bio: string | null;
  songCount: number;
  totalPlayCount: number;
  playlists: ArtistPlaylistRef[];
  genres: ArtistGenreCount[];
  videos: PlaylistVideo[];
}

export const artistsApi = {
  list: async (query?: string): Promise<ArtistSummary[]> => {
    const { data } = await client.get<{ artists: ArtistSummary[] }>('/artists', {
      params: query ? { q: query } : undefined,
    });
    return data.artists;
  },

  getDetail: async (key: string): Promise<ArtistDetail> => {
    const { data } = await client.get<ArtistDetail>(`/artists/${encodeURIComponent(key)}`);
    return data;
  },
};
