import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlaylistVideo } from '../../../api/youtube';
import { normalizeGenreKey, formatGenre } from '../../PlaylistsPage/utils';

export type GenreCount = { key: string; label: string; count: number };

export const NO_GENRE_KEY = 'none';

export type SortOption =
  | 'import-asc' | 'import-desc'
  | 'name-asc' | 'name-desc' | 'artist-asc' | 'artist-desc' | 'plays-asc' | 'plays-desc';
// "Import order" = addedAt, i.e. the order tracks were actually added to the
// library — not YouTube's mutable per-playlist `position`, which only makes
// sense within a single playlist and would collide across playlists on the
// All Tracks page. Descending (newest-added-first) is the default, matching
// the All Tracks page's own backend fetch order (routes/youtube.ts's
// /all-tracks uses orderBy: addedAt desc) — picking it back explicitly is a
// no-op, same as any other default sort choice.
export const DEFAULT_SORT: SortOption = 'import-desc';
const SORT_OPTIONS = new Set<SortOption>([
  'import-asc', 'import-desc',
  'name-asc', 'name-desc', 'artist-asc', 'artist-desc', 'plays-asc', 'plays-desc',
]);

const GENRES_PARAM = 'genres';
const SORT_PARAM = 'sort';
const HQ_PARAM = 'hq';
const SEARCH_PARAM = 'q';

function parseGenres(raw: string | null): Set<string> {
  return new Set((raw ?? '').split(',').map(normalizeGenreKey).filter(Boolean));
}

function parseSort(raw: string | null): SortOption {
  return SORT_OPTIONS.has(raw as SortOption) ? (raw as SortOption) : DEFAULT_SORT;
}

// Shared by usePlaylistDetail and useAllTracksDetail — both read/write the
// same URL param conventions (?genres=, ?sort=, ?hq=, ?q=), so every track
// filter/sort control is deep-linkable and survives a refresh the same way
// on either page.
export function useTrackFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedGenres = useMemo(() => parseGenres(searchParams.get(GENRES_PARAM)), [searchParams]);
  const sort = useMemo(() => parseSort(searchParams.get(SORT_PARAM)), [searchParams]);
  const hqOnly = searchParams.get(HQ_PARAM) === '1';
  const searchQuery = searchParams.get(SEARCH_PARAM) ?? '';

  const toggleGenre = useCallback((genre: string) => {
    const key = normalizeGenreKey(genre);
    setSearchParams(prev => {
      const next = parseGenres(prev.get(GENRES_PARAM));
      if (next.has(key)) next.delete(key); else next.add(key);
      const params = new URLSearchParams(prev);
      if (next.size > 0) params.set(GENRES_PARAM, [...next].join(',')); else params.delete(GENRES_PARAM);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const clearGenres = useCallback(() => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.delete(GENRES_PARAM);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const setSort = useCallback((next: SortOption) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next === DEFAULT_SORT) params.delete(SORT_PARAM); else params.set(SORT_PARAM, next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const setHqOnly = useCallback((next: boolean) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next) params.set(HQ_PARAM, '1'); else params.delete(HQ_PARAM);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const setSearchQuery = useCallback((next: string) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next.trim()) params.set(SEARCH_PARAM, next); else params.delete(SEARCH_PARAM);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    selectedGenres, toggleGenre, clearGenres,
    sort, setSort,
    hqOnly, setHqOnly,
    searchQuery, setSearchQuery,
  };
}

export function computeGenreCounts(videos: PlaylistVideo[]): GenreCount[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  let noGenreCount = 0;
  for (const v of videos) {
    if (v.genres.length === 0) {
      noGenreCount++;
      continue;
    }
    for (const raw of v.genres) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = normalizeGenreKey(trimmed);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const existingLabel = labels.get(key);
      if (!existingLabel || (!/^[A-Z]/.test(existingLabel) && /^[A-Z]/.test(trimmed))) {
        labels.set(key, trimmed);
      }
    }
  }
  const sorted: GenreCount[] = [...counts.entries()]
    .map(([key, count]) => ({ key, label: formatGenre(labels.get(key)!), count }));
  if (noGenreCount > 0) sorted.push({ key: NO_GENRE_KEY, label: NO_GENRE_KEY, count: noGenreCount });
  return sorted.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function filterByGenres(videos: PlaylistVideo[], selectedGenres: Set<string>): PlaylistVideo[] {
  if (selectedGenres.size === 0) return videos;
  return videos.filter(v => v.genres.length === 0
    ? selectedGenres.has(NO_GENRE_KEY)
    : v.genres.some(g => selectedGenres.has(normalizeGenreKey(g))));
}

export function filterByHq(videos: PlaylistVideo[], hqOnly: boolean): PlaylistVideo[] {
  return hqOnly ? videos.filter(v => v.hqFileDownloaded) : videos;
}

export function filterBySearch(videos: PlaylistVideo[], query: string): PlaylistVideo[] {
  const q = query.trim().toLowerCase();
  if (!q) return videos;
  return videos.filter(v => v.title.toLowerCase().includes(q) || (v.artist?.toLowerCase().includes(q) ?? false));
}

export function sortTracks(videos: PlaylistVideo[], sort: SortOption): PlaylistVideo[] {
  const sorted = [...videos];
  switch (sort) {
    case 'import-asc': return sorted.sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt));
    case 'import-desc': return sorted.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
    case 'name-asc': return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'name-desc': return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'artist-asc': return sorted.sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || a.title.localeCompare(b.title));
    case 'artist-desc': return sorted.sort((a, b) => (b.artist ?? '').localeCompare(a.artist ?? '') || a.title.localeCompare(b.title));
    case 'plays-asc': return sorted.sort((a, b) => a.playCount - b.playCount || a.title.localeCompare(b.title));
    case 'plays-desc': return sorted.sort((a, b) => b.playCount - a.playCount || a.title.localeCompare(b.title));
  }
}
