import { useEffect, useMemo, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../api/playlists';
import { SortOption, DEFAULT_SORT, sortTracks } from '../../utils/trackSort';
import { normalizeGenreKey } from '../../utils/format';

export interface AllTracksSummary {
  songCount: number;
  totalDurationSec: number;
}

// Mirrors frontend/src/pages/AllTracksPage/hooks/useAllTracksDetail.ts —
// every downloaded track across every playlist, in one flat list. No
// per-playlist sync-status concept applies here (see AllTracksScreen), and
// unlike PlaylistDetailScreen there's nothing to poll — this is a read-only
// aggregate, not a syncing entity.
//
// genreFilter is a single preselected key (see AllTracksScreen's route
// params) rather than web's full multi-select genre picker — that richer
// UI isn't ported yet, so this only supports arriving already filtered by
// one genre (from a genre chip/tile elsewhere) and clearing it, not
// picking additional genres from within this screen.
export function useAllTracksDetail(initialGenreKey?: string) {
  const [data, setData] = useState<{ videos: PlaylistVideo[]; summary: AllTracksSummary } | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState<string | null>(initialGenreKey ? normalizeGenreKey(initialGenreKey) : null);

  useEffect(() => {
    playlistsApi.getAllTracks()
      .then(({ videos, songCount, totalDurationSec }) => setData({ videos, summary: { songCount, totalDurationSec } }))
      .catch(() => setData('error'));
  }, []);

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  const filteredTracks = useMemo(() => {
    const byGenre = genreFilter
      ? videos.filter(v => v.genres.some(g => normalizeGenreKey(g) === genreFilter))
      : videos;
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? byGenre.filter(v => v.title.toLowerCase().includes(q) || (v.artist?.toLowerCase().includes(q) ?? false))
      : byGenre;
    return sortTracks(filtered, sort);
  }, [videos, genreFilter, searchQuery, sort]);

  const playableQueue = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  // Drops a just-deleted track from local state immediately — see
  // TrackContextMenu's onDeleted callback.
  const removeVideo = (videoId: string) => {
    setData(prev => (prev === 'loading' || prev === 'error' ? prev : { ...prev, videos: prev.videos.filter(v => v.id !== videoId) }));
  };

  // Patches a single track in local state once a "Search for HQ" run
  // finishes — see TrackRow's onUpdated callback.
  const updateVideo = (video: PlaylistVideo) => {
    setData(prev => (prev === 'loading' || prev === 'error' ? prev : { ...prev, videos: prev.videos.map(v => (v.id === video.id ? video : v)) }));
  };

  return {
    status: data === 'loading' ? 'loading' as const : data === 'error' ? 'error' as const : 'ready' as const,
    summary: data === 'loading' || data === 'error' ? null : data.summary,
    filteredTracks, playableQueue,
    sort, setSort, searchQuery, setSearchQuery,
    genreFilter, setGenreFilter, removeVideo, updateVideo,
  };
}
