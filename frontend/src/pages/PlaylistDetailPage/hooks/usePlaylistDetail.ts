import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { playlistsApi, Playlist, PlaylistVideo } from '../../../api/youtube';
import { useGenreFilterParams, computeGenreCounts, filterByGenres } from './genreFilter';

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

  const { selectedGenres, toggleGenre, clearGenres } = useGenreFilterParams();

  const currentVideos = useMemo(
    () => (Array.isArray(videos) ? videos.filter(v => v.downloadStatus !== 'removed') : []),
    [videos]
  );

  const genreCounts = useMemo(() => computeGenreCounts(currentVideos), [currentVideos]);

  const filteredTracks = useMemo(() => {
    const filtered = filterByGenres(currentVideos, selectedGenres);
    return [...filtered].sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }, [currentVideos, selectedGenres]);

  const playableTracks = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  return {
    playlistId: id ?? '',
    playlist, videos,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    filteredTracks, playableTracks,
  };
}
