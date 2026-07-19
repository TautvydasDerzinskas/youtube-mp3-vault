import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { playlistsApi, Playlist, PlaylistVideo } from '../../../api/youtube';

export type GenreCount = { genre: string; count: number };

const GENRES_PARAM = 'genres';

function parseGenres(raw: string | null): Set<string> {
  return new Set((raw ?? '').split(',').map(g => g.trim()).filter(Boolean));
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
    setSearchParams(prev => {
      const next = parseGenres(prev.get(GENRES_PARAM));
      if (next.has(genre)) next.delete(genre); else next.add(genre);
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

  const genreCounts = useMemo((): GenreCount[] => {
    const counts = new Map<string, number>();
    for (const v of currentVideos) {
      if (v.genre) counts.set(v.genre, (counts.get(v.genre) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [currentVideos]);

  // Order tracks were actually added to this library (immutable, set once at
  // sync time) — distinct from YouTube's own mutable playlist `position`.
  const filteredTracks = useMemo(() => {
    const filtered = selectedGenres.size === 0
      ? currentVideos
      : currentVideos.filter(v => v.genre && selectedGenres.has(v.genre));
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
