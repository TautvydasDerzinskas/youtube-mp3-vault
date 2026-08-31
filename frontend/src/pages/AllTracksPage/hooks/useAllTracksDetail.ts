import { useEffect, useMemo, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../../api/youtube';
import {
  useTrackFilterParams, computeGenreCounts, filterByGenres, filterByHq, filterByFavourite, filterBySearch, sortTracks,
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
    sort, setSort, hqFilter, setHqFilter, favouriteFilter, setFavouriteFilter, searchQuery, setSearchQuery,
  } = useTrackFilterParams();

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  const genreCounts = useMemo(() => computeGenreCounts(videos), [videos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterBySearch(
      filterByFavourite(filterByHq(filterByGenres(videos, selectedGenres), hqFilter), favouriteFilter),
      searchQuery
    );
    return sortTracks(filtered, sort);
  }, [videos, selectedGenres, hqFilter, favouriteFilter, searchQuery, sort]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  // Drops a just-deleted track from local state immediately, rather than
  // waiting for a full refetch — same rationale as usePlaylistDetail's
  // removeVideo, see TrackContextMenu's onDeleted callback.
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
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, favouriteFilter, setFavouriteFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks,
    removeVideo, updateVideo,
  };
}
