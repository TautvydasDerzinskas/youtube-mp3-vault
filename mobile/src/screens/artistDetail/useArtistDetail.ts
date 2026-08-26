import { useEffect, useMemo, useState } from 'react';
import { artistsApi, ArtistDetail } from '../../api/artists';
import { PlaylistVideo } from '../../api/playlists';

// Mirrors frontend/src/pages/ArtistDetailPage/index.tsx — no sort/filter of
// its own, tracks come back pre-sorted addedAt desc from the backend.
export function useArtistDetail(key: string) {
  const [artist, setArtist] = useState<ArtistDetail | 'loading' | 'error'>('loading');

  useEffect(() => {
    setArtist('loading');
    artistsApi.getDetail(key).then(setArtist).catch(() => setArtist('error'));
  }, [key]);

  const playableQueue = useMemo(
    () => (artist === 'loading' || artist === 'error' ? [] : artist.videos.filter(v => v.downloadStatus === 'done')),
    [artist]
  );

  // Drops a just-deleted track from local state immediately — see
  // TrackContextMenu's onDeleted callback.
  const removeVideo = (videoId: string) => {
    setArtist(prev => (prev === 'loading' || prev === 'error' ? prev : { ...prev, videos: prev.videos.filter(v => v.id !== videoId) }));
  };

  // Patches a single track in local state once a "Search for HQ" run
  // finishes — see TrackRow's onUpdated callback.
  const updateVideo = (video: PlaylistVideo) => {
    setArtist(prev => (prev === 'loading' || prev === 'error' ? prev : { ...prev, videos: prev.videos.map(v => (v.id === video.id ? video : v)) }));
  };

  return { artist, playableQueue, removeVideo, updateVideo };
}
