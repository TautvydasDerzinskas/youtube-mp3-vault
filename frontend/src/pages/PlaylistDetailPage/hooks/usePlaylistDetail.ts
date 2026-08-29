import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { playlistsApi, Playlist, PlaylistVideo } from '../../../api/youtube';
import { useTrackFilterParams, computeGenreCounts, filterByGenres, filterByHq, filterBySearch, sortTracks } from './genreFilter';

export function usePlaylistDetail() {
  const { id } = useParams<{ id: string }>();

  const [playlist, setPlaylist] = useState<Playlist | 'loading' | 'error'>('loading');
  const [videos, setVideos] = useState<PlaylistVideo[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!id) return;
    setPlaylist('loading');
    setVideos('loading');
    playlistsApi.getOne(id).then(({ playlist }) => setPlaylist(playlist)).catch(() => setPlaylist('error'));
    playlistsApi.getVideos(id).then(({ videos }) => setVideos(videos)).catch(() => setVideos('error'));
  }, [id]);

  const {
    selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
  } = useTrackFilterParams();

  const currentVideos = useMemo(
    () => (Array.isArray(videos) ? videos.filter(v => v.downloadStatus !== 'removed') : []),
    [videos]
  );

  const genreCounts = useMemo(() => computeGenreCounts(currentVideos), [currentVideos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterBySearch(filterByHq(filterByGenres(currentVideos, selectedGenres), hqFilter), searchQuery);
    return sortTracks(filtered, sort);
  }, [currentVideos, selectedGenres, hqFilter, searchQuery, sort]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  // Drops a just-deleted track from local state immediately, rather than
  // waiting for a full refetch — see TrackContextMenu's onDeleted callback.
  const removeVideo = (videoId: string) => {
    setVideos(prev => (Array.isArray(prev) ? prev.filter(v => v.id !== videoId) : prev));
  };

  // Patches a single track in local state once a "Search for HQ" run
  // finishes — see TrackRow's onUpdated callback.
  const updateVideo = (video: PlaylistVideo) => {
    setVideos(prev => (Array.isArray(prev) ? prev.map(v => (v.id === video.id ? video : v)) : prev));
  };

  // Patches the header's own playlist once rename/pause-resume resolves —
  // see PlaylistActionsMenu's onRename/onTogglePause callbacks.
  const updatePlaylist = (fresh: Playlist) => setPlaylist(fresh);

  // Independent of the current sort/filter/search state above (unlike
  // playableTracks) — "play first" always means the actual first track of
  // the playlist itself, not whatever happens to be first in a filtered or
  // re-sorted view of it.
  const orderedPlayableTracks = useMemo(
    () => [...currentVideos].filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position),
    [currentVideos]
  );
  const firstPlayableTrack = orderedPlayableTracks[0] ?? null;

  return {
    playlistId: id ?? '',
    playlist, videos,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks,
    orderedPlayableTracks, firstPlayableTrack,
    removeVideo, updateVideo, updatePlaylist,
  };
}
