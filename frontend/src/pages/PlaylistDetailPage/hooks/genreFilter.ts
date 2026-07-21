import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlaylistVideo } from '../../../api/youtube';
import { normalizeGenreKey, formatGenre } from '../../PlaylistsPage/utils';

export type GenreCount = { key: string; label: string; count: number };

export const NO_GENRE_KEY = 'none';

const GENRES_PARAM = 'genres';

function parseGenres(raw: string | null): Set<string> {
  return new Set((raw ?? '').split(',').map(normalizeGenreKey).filter(Boolean));
}

// Shared by usePlaylistDetail and useAllTracksDetail — both read/write the
// same ?genres= URL param convention, so a genre filter is deep-linkable and
// survives navigation the same way on either page.
export function useGenreFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedGenres = useMemo(() => parseGenres(searchParams.get(GENRES_PARAM)), [searchParams]);

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

  return { selectedGenres, toggleGenre, clearGenres };
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
