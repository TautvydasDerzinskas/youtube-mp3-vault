import { useEffect, useMemo, useState } from 'react';
import { dashboardApi, DashboardGenre } from '../../api/dashboard';

// Mirrors frontend/src/pages/GenresPage/index.tsx — sort and search are
// both client-side (the backend already returns every genre in one shot,
// same "small list, no round trip" reasoning as ArtistsScreen's sort, but
// unlike Artists, search here doesn't warrant a server round trip either).
export type GenreSortOption = 'name-asc' | 'name-desc' | 'songCount-desc' | 'songCount-asc';
export const DEFAULT_GENRE_SORT: GenreSortOption = 'name-asc';

function sortGenres(genres: DashboardGenre[], sort: GenreSortOption): DashboardGenre[] {
  const sorted = [...genres];
  switch (sort) {
    case 'name-asc': return sorted.sort((a, b) => a.genre.localeCompare(b.genre));
    case 'name-desc': return sorted.sort((a, b) => b.genre.localeCompare(a.genre));
    case 'songCount-desc': return sorted.sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
    case 'songCount-asc': return sorted.sort((a, b) => a.count - b.count || a.genre.localeCompare(b.genre));
  }
}

export function useGenres() {
  const [genres, setGenres] = useState<DashboardGenre[] | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<GenreSortOption>(DEFAULT_GENRE_SORT);
  const [query, setQuery] = useState('');

  useEffect(() => {
    dashboardApi.getAllGenres().then(setGenres).catch(() => setGenres('error'));
  }, []);

  const visibleGenres = useMemo(() => {
    if (!Array.isArray(genres)) return genres;
    const q = query.trim().toLowerCase();
    const filtered = q ? genres.filter(g => g.genre.toLowerCase().includes(q)) : genres;
    return sortGenres(filtered, sort);
  }, [genres, sort, query]);

  return { genres: visibleGenres, query, setQuery, sort, setSort };
}
