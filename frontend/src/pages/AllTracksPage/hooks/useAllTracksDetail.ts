import { useEffect, useMemo, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../../api/youtube';
import { useGenreFilterParams, computeGenreCounts, filterByGenres } from '../../PlaylistDetailPage/hooks/genreFilter';

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

  const { selectedGenres, toggleGenre, clearGenres } = useGenreFilterParams();

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  const genreCounts = useMemo(() => computeGenreCounts(videos), [videos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterByGenres(videos, selectedGenres);
    return [...filtered].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }, [videos, selectedGenres]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  return {
    status: data === 'loading' ? 'loading' as const : data === 'error' ? 'error' as const : 'ready' as const,
    summary: data === 'loading' || data === 'error' ? null : data.summary,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    filteredTracks, playableTracks,
  };
}
