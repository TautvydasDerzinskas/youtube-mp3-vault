import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { playlistsApi, PlaylistVideo } from '../../../api/youtube';
import { filterBySearch } from '../../PlaylistDetailPage/hooks/genreFilter';

export interface HistorySummary {
  songCount: number;
  totalDurationSec: number;
}

const SEARCH_PARAM = 'q';

// Unlike PlaylistDetailPage/AllTracksPage, History has no sort/genre/HQ
// controls at all — the whole point of this list is "most recently played
// first", the fixed order GET /history already returns; letting it be
// re-sorted or filtered down by genre/HQ would fight that. Search is kept
// since narrowing to a track you know you played doesn't fight the ordering
// the same way sorting/filtering would. So this manages its own `?q=` param
// directly rather than pulling in the shared useTrackFilterParams.
export function useHistoryDetail() {
  const [data, setData] = useState<{ videos: PlaylistVideo[]; summary: HistorySummary } | 'loading' | 'error'>('loading');
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get(SEARCH_PARAM) ?? '';

  useEffect(() => {
    playlistsApi.getHistory()
      .then(({ videos, songCount, totalDurationSec }) => setData({ videos, summary: { songCount, totalDurationSec } }))
      .catch(() => setData('error'));
  }, []);

  const setSearchQuery = useCallback((next: string) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next.trim()) params.set(SEARCH_PARAM, next); else params.delete(SEARCH_PARAM);
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  // No sortTracks/filterByGenres/filterByHq here — `videos` is already in
  // the order the backend returned it (most-recently-played first), and
  // search is the only narrowing this page offers.
  const filteredTracks = useMemo(() => filterBySearch(videos, searchQuery), [videos, searchQuery]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  const removeVideo = (videoId: string) => {
    setData(prev => (prev === 'loading' || prev === 'error' ? prev : { ...prev, videos: prev.videos.filter(v => v.id !== videoId) }));
  };

  const updateVideo = (video: PlaylistVideo) => {
    setData(prev => (prev === 'loading' || prev === 'error' ? prev : { ...prev, videos: prev.videos.map(v => (v.id === video.id ? video : v)) }));
  };

  return {
    status: data === 'loading' ? 'loading' as const : data === 'error' ? 'error' as const : 'ready' as const,
    summary: data === 'loading' || data === 'error' ? null : data.summary,
    searchQuery, setSearchQuery,
    filteredTracks, playableTracks,
    removeVideo, updateVideo,
  };
}
