import { useEffect, useMemo, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../../api/youtube';
import {
  useTrackFilterParams, computeGenreCounts, filterByGenres, filterByHq, filterBySearch, sortTracks,
} from '../../PlaylistDetailPage/hooks/genreFilter';

export interface AllTracksSummary {
  songCount: number;
  totalDurationSec: number;
}

export function useAllTracksDetail() {
  const [data, setData] = useState<{ videos: PlaylistVideo[]; summary: AllTracksSummary } | 'loading' | 'error'>('loading');

  useEffect(() => {
    playlistsApi.getAllTracks()
      .then(({ videos, songCount, totalDurationSec }) => setData({ videos, summary: { songCount, totalDurationSec } }))
      .catch(() => setData('error'));
  }, []);

  const {
    selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqOnly, setHqOnly, searchQuery, setSearchQuery,
  } = useTrackFilterParams();

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  const genreCounts = useMemo(() => computeGenreCounts(videos), [videos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterBySearch(filterByHq(filterByGenres(videos, selectedGenres), hqOnly), searchQuery);
    return sortTracks(filtered, sort);
  }, [videos, selectedGenres, hqOnly, searchQuery, sort]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  return {
    status: data === 'loading' ? 'loading' as const : data === 'error' ? 'error' as const : 'ready' as const,
    summary: data === 'loading' || data === 'error' ? null : data.summary,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqOnly, setHqOnly, searchQuery, setSearchQuery,
    filteredTracks, playableTracks,
  };
}
