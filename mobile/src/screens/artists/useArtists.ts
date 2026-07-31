import { useEffect, useMemo, useState } from 'react';
import { artistsApi, ArtistSummary } from '../../api/artists';

// Mirrors frontend/src/pages/ArtistsPage/index.tsx's local SortOption —
// distinct from utils/trackSort.ts's SortOption, which sorts tracks within
// a playlist, not artists themselves.
export type ArtistSortOption = 'name-asc' | 'name-desc' | 'songCount-desc' | 'songCount-asc' | 'plays-desc' | 'plays-asc';
export const DEFAULT_ARTIST_SORT: ArtistSortOption = 'name-asc';

// Search is backend-driven (matches artist name OR song title — matching on
// song titles too would otherwise mean shipping every artist's full track
// list down just to filter locally) and debounced so typing doesn't fire a
// request per keystroke. Sort is client-side — the backend already returns
// every matching artist in one shot, so re-sorting a small in-memory array
// doesn't warrant a round trip, and (deliberately, matching web) doesn't
// re-show a loading spinner on every keystroke/sort change either.
const SEARCH_DEBOUNCE_MS = 300;

function sortArtists(artists: ArtistSummary[], sort: ArtistSortOption): ArtistSummary[] {
  const sorted = [...artists];
  switch (sort) {
    case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'songCount-desc': return sorted.sort((a, b) => b.songCount - a.songCount || a.name.localeCompare(b.name));
    case 'songCount-asc': return sorted.sort((a, b) => a.songCount - b.songCount || a.name.localeCompare(b.name));
    case 'plays-desc': return sorted.sort((a, b) => b.totalPlayCount - a.totalPlayCount || a.name.localeCompare(b.name));
    case 'plays-asc': return sorted.sort((a, b) => a.totalPlayCount - b.totalPlayCount || a.name.localeCompare(b.name));
  }
}

export function useArtists() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [artists, setArtists] = useState<ArtistSummary[] | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<ArtistSortOption>(DEFAULT_ARTIST_SORT);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    artistsApi.list(debouncedQuery || undefined).then(setArtists).catch(() => setArtists('error'));
  }, [debouncedQuery]);

  const sortedArtists = useMemo(
    () => (Array.isArray(artists) ? sortArtists(artists, sort) : artists),
    [artists, sort]
  );

  return { query, setQuery, debouncedQuery, artists: sortedArtists, sort, setSort };
}
