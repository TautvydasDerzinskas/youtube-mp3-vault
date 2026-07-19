import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { playlistsApi, Playlist, PlaylistVideo } from '../../../api/youtube';
import { normalizeGenreKey, formatGenre } from '../../PlaylistsPage/utils';

// `key` is the normalized (lowercase) identity used for selection/filtering;
// `label` is what's actually shown, preserving genuine multi-word casing
// (e.g. "Drum n Bass") wherever a properly-cased variant exists — see
// genreCounts below for why these can't just be derived from each other.
export type GenreCount = { key: string; label: string; count: number };

// Synthetic bucket for tracks with no genre — either audio analysis hasn't
// run yet, or found nothing. Already normalized (lowercase), so it can't
// collide with a real genre key.
export const NO_GENRE_KEY = 'none';

const GENRES_PARAM = 'genres';

// Selection state lives in normalized (lowercase) keys throughout — the URL,
// the Set, the filter check — so a genre picked while displayed as
// "Electronic" still matches tracks stored as "electronic". Only the chip
// label (via formatGenre) is ever displayed capitalized.
function parseGenres(raw: string | null): Set<string> {
  return new Set((raw ?? '').split(',').map(normalizeGenreKey).filter(Boolean));
}

/**
 * Owns the detail page's data (playlist + its full track list, fetched once)
 * and its genre-filter state. The filter lives in the URL (?genres=a,b) so a
 * refresh or a shared link reproduces the same filtered view — selecting it
 * is intentionally kept client-side-only (no re-fetch), since with playlists
 * in the thousands-of-tracks range a full list is already in memory and
 * re-filtering it is much cheaper than a round trip.
 */
export function usePlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [playlist, setPlaylist] = useState<Playlist | 'loading' | 'error'>('loading');
  const [videos, setVideos] = useState<PlaylistVideo[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!id) return;
    setPlaylist('loading');
    setVideos('loading');
    playlistsApi.getOne(id).then(({ playlist }) => setPlaylist(playlist)).catch(() => setPlaylist('error'));
    playlistsApi.getVideos(id).then(({ videos }) => setVideos(videos)).catch(() => setVideos('error'));
  }, [id]);

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

  // Videos no longer in the source YouTube playlist (removed on a later sync)
  // stick around in the DB for MediaFile bookkeeping but shouldn't show up
  // as playlist content here.
  const currentVideos = useMemo(
    () => (Array.isArray(videos) ? videos.filter(v => v.downloadStatus !== 'removed') : []),
    [videos]
  );

  // Each tag a track carries counts toward its own chip — a track tagged
  // ["Electronic", "Hip Hop", "Drum n Bass"] contributes to all three, not
  // just one. Grouping on the normalized key means "Electronic" and
  // "electronic" (old pre-Essentia MusicBrainz tags predate consistent
  // casing) still collapse into one chip instead of showing as duplicates.
  // The label shown for that group prefers whichever variant was already
  // properly capitalized (real Essentia/taxonomy casing, e.g. "Drum n Bass")
  // over a stray all-lowercase one — naively lowercasing everything for the
  // key and re-deriving the label from *that* would flatten correct
  // multi-word casing down to just the first letter.
  const genreCounts = useMemo((): GenreCount[] => {
    const counts = new Map<string, number>();
    const labels = new Map<string, string>();
    let noGenreCount = 0;
    for (const v of currentVideos) {
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
    const sorted = [...counts.entries()]
      .map(([key, count]) => ({ key, label: formatGenre(labels.get(key)!), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    // Always last — it's a fallback bucket, not a genre competing on frequency.
    if (noGenreCount > 0) sorted.push({ key: NO_GENRE_KEY, label: NO_GENRE_KEY, count: noGenreCount });
    return sorted;
  }, [currentVideos]);

  // A track matches the filter if it carries *any* selected tag (union, not
  // intersection) — selecting both "Electronic" and "Hip Hop" surfaces
  // tracks tagged with either, which is what naturally catches a genuine
  // hybrid track tagged with both.
  //
  // Order tracks were actually added to this library (immutable, set once at
  // sync time) — distinct from YouTube's own mutable playlist `position`.
  const filteredTracks = useMemo(() => {
    const filtered = selectedGenres.size === 0
      ? currentVideos
      : currentVideos.filter(v => v.genres.length === 0
          ? selectedGenres.has(NO_GENRE_KEY)
          : v.genres.some(g => selectedGenres.has(normalizeGenreKey(g))));
    return [...filtered].sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
  }, [currentVideos, selectedGenres]);

  // The subset of filteredTracks that's actually playable — passed to the
  // player as an explicit queue so next/prev/auto-advance only ever land on
  // tracks that are both downloaded and within the current genre filter.
  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  return {
    playlistId: id ?? '',
    playlist, videos,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    filteredTracks, playableTracks,
  };
}
