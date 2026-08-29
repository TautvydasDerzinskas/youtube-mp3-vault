import { useEffect, useMemo, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../../api/youtube';
import {
  useTrackFilterParams, computeGenreCounts, filterByGenres, filterByHq, filterBySearch, sortTracks,
} from '../../PlaylistDetailPage/hooks/genreFilter';

export interface HistorySummary {
  songCount: number;
  totalDurationSec: number;
}

// Mirrors useAllTracksDetail — same client-side genre/HQ/search/sort
// filtering over a full track list — pointed at GET /history instead of
// /all-tracks, and defaulting to "most recently played first" (the backend
// already returns rows in that order; this default just keeps the UI's own
// re-sort from silently overriding it) rather than "most recently added".
export function useHistoryDetail() {
  const [data, setData] = useState<{ videos: PlaylistVideo[]; summary: HistorySummary } | 'loading' | 'error'>('loading');

  useEffect(() => {
    playlistsApi.getHistory()
      .then(({ videos, songCount, totalDurationSec }) => setData({ videos, summary: { songCount, totalDurationSec } }))
      .catch(() => setData('error'));
  }, []);

  const {
    selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
  } = useTrackFilterParams('played-desc');

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  const genreCounts = useMemo(() => computeGenreCounts(videos), [videos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterBySearch(filterByHq(filterByGenres(videos, selectedGenres), hqFilter), searchQuery);
    return sortTracks(filtered, sort);
  }, [videos, selectedGenres, hqFilter, searchQuery, sort]);

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
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks,
    removeVideo, updateVideo,
  };
}
