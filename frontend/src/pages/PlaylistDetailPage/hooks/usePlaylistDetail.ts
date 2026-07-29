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
    sort, setSort, hqOnly, setHqOnly, searchQuery, setSearchQuery,
  } = useTrackFilterParams();

  const currentVideos = useMemo(
    () => (Array.isArray(videos) ? videos.filter(v => v.downloadStatus !== 'removed') : []),
    [videos]
  );

  const genreCounts = useMemo(() => computeGenreCounts(currentVideos), [currentVideos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterBySearch(filterByHq(filterByGenres(currentVideos, selectedGenres), hqOnly), searchQuery);
    return sortTracks(filtered, sort);
  }, [currentVideos, selectedGenres, hqOnly, searchQuery, sort]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  return {
    playlistId: id ?? '',
    playlist, videos,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqOnly, setHqOnly, searchQuery, setSearchQuery,
    filteredTracks, playableTracks,
  };
}
