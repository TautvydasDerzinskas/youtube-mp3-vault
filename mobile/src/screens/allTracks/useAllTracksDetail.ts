import { useEffect, useMemo, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../api/playlists';
import { SortOption, DEFAULT_SORT, sortTracks } from '../../utils/trackSort';

export interface AllTracksSummary {
  songCount: number;
  totalDurationSec: number;
}

// Mirrors frontend/src/pages/AllTracksPage/hooks/useAllTracksDetail.ts —
// every downloaded track across every playlist, in one flat list. No
// per-playlist sync-status concept applies here (see AllTracksScreen), and
// unlike PlaylistDetailScreen there's nothing to poll — this is a read-only
// aggregate, not a syncing entity.
export function useAllTracksDetail() {
  const [data, setData] = useState<{ videos: PlaylistVideo[]; summary: AllTracksSummary } | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    playlistsApi.getAllTracks()
      .then(({ videos, songCount, totalDurationSec }) => setData({ videos, summary: { songCount, totalDurationSec } }))
      .catch(() => setData('error'));
  }, []);

  const videos = useMemo(() => (data === 'loading' || data === 'error' ? [] : data.videos), [data]);

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? videos.filter(v => v.title.toLowerCase().includes(q) || (v.artist?.toLowerCase().includes(q) ?? false))
      : videos;
    return sortTracks(filtered, sort);
  }, [videos, searchQuery, sort]);

  const playableQueue = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  return {
    status: data === 'loading' ? 'loading' as const : data === 'error' ? 'error' as const : 'ready' as const,
    summary: data === 'loading' || data === 'error' ? null : data.summary,
    filteredTracks, playableQueue,
    sort, setSort, searchQuery, setSearchQuery,
  };
}
