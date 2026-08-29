import { useCallback, useEffect, useMemo, useState } from 'react';
import { playlistsApi, Playlist, PlaylistVideo } from '../../api/playlists';
import { SortOption, DEFAULT_SORT, sortTracks } from '../../utils/trackSort';

export type { SortOption };
export { DEFAULT_SORT };

// Mirrors frontend/src/pages/PlaylistDetailPage/hooks/usePlaylistDetail.ts —
// same orderedPlayableTracks/firstPlayableTrack "play first ignores current
// sort/filter" semantics. Genre filtering and the HQ-only toggle aren't
// ported yet (search + sort cover the common case); unlike web, this DOES
// poll while the playlist is actively syncing (see the second effect) so
// the sync-status banner at the top of PlaylistDetailScreen and each row's
// download-status icon stay live — this is where "syncing details" live on
// mobile instead of web's accordion-expanded row.
export function usePlaylistDetail(playlistId: string) {
  const [playlist, setPlaylist] = useState<Playlist | 'loading' | 'error'>('loading');
  const [videos, setVideos] = useState<PlaylistVideo[] | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(() => {
    setPlaylist('loading');
    setVideos('loading');
    playlistsApi.getOne(playlistId).then(({ playlist: p }) => setPlaylist(p)).catch(() => setPlaylist('error'));
    playlistsApi.getVideos(playlistId).then(({ videos: v }) => setVideos(v)).catch(() => setVideos('error'));
  }, [playlistId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (playlist === 'loading' || playlist === 'error') return;
    const isActive = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'retrying'
      || playlist.syncStatus === 'generating' || playlist.syncStatus === 'scanning_hq';
    if (!isActive) return;
    const timer = setTimeout(async () => {
      try {
        const [{ playlist: freshPlaylist }, { videos: freshVideos }] = await Promise.all([
          playlistsApi.getOne(playlistId),
          playlistsApi.getVideos(playlistId),
        ]);
        setPlaylist(freshPlaylist);
        setVideos(freshVideos);
      } catch {
        // Network hiccup — stop polling silently, matching usePlaylists.
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [playlist, playlistId]);

  const currentVideos = useMemo(
    () => (Array.isArray(videos) ? videos.filter(v => v.downloadStatus !== 'removed') : []),
    [videos]
  );

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? currentVideos.filter(v => v.title.toLowerCase().includes(q) || (v.artist?.toLowerCase().includes(q) ?? false))
      : currentVideos;
    return sortTracks(filtered, sort);
  }, [currentVideos, searchQuery, sort]);

  const orderedPlayableTracks = useMemo(
    () => [...currentVideos].filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position),
    [currentVideos]
  );
  const firstPlayableTrack = orderedPlayableTracks[0] ?? null;

  // Drops a just-deleted track from local state immediately, rather than
  // waiting for the next poll/refetch — see TrackContextMenu's onDeleted
  // callback.
  const removeVideo = (videoId: string) => {
    setVideos(prev => (Array.isArray(prev) ? prev.filter(v => v.id !== videoId) : prev));
  };

  // Patches a single track in local state once a "Search for HQ" run
  // finishes — see TrackRow's onUpdated callback.
  const updateVideo = (video: PlaylistVideo) => {
    setVideos(prev => (Array.isArray(prev) ? prev.map(v => (v.id === video.id ? video : v)) : prev));
  };

  return {
    playlist, videos, currentVideos, filteredTracks, orderedPlayableTracks, firstPlayableTrack,
    sort, setSort, searchQuery, setSearchQuery, reload: load, removeVideo, updateVideo,
  };
}
