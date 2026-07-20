import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { playlistsApi, PlaylistVideo, RecommendedTrack, RemixResult, DiscoverResult, UsedInPlaylist } from '../../../api/youtube';

export function useTrackDetail() {
  const { id, trackId } = useParams<{ id: string; trackId: string }>();

  const [video, setVideo] = useState<PlaylistVideo | 'loading' | 'error'>('loading');
  const [recommendations, setRecommendations] = useState<RecommendedTrack[] | 'loading' | 'error'>('loading');
  const [discover, setDiscover] = useState<DiscoverResult[] | 'loading' | 'error' | 'disabled'>('loading');
  const [remixes, setRemixes] = useState<RemixResult[] | 'loading' | 'error'>('loading');
  const [usedIn, setUsedIn] = useState<UsedInPlaylist[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!id || !trackId) return;
    setVideo('loading');
    setRecommendations('loading');
    setDiscover('loading');
    setRemixes('loading');
    setUsedIn('loading');

    playlistsApi.getVideo(id, trackId)
      .then(({ video }) => setVideo(video))
      .catch(() => setVideo('error'));
    playlistsApi.getRecommendations(id, trackId)
      .then(({ recommendations }) => setRecommendations(recommendations))
      .catch(() => setRecommendations('error'));
    playlistsApi.getDiscover(id, trackId)
      .then(({ enabled, discover }) => setDiscover(enabled ? discover : 'disabled'))
      .catch(() => setDiscover('error'));
    playlistsApi.getRemixes(id, trackId)
      .then(({ remixes }) => setRemixes(remixes))
      .catch(() => setRemixes('error'));
    playlistsApi.getUsedIn(id, trackId)
      .then(({ usedIn }) => setUsedIn(usedIn))
      .catch(() => setUsedIn('error'));
  }, [id, trackId]);

  return { playlistId: id ?? '', video, recommendations, discover, remixes, usedIn };
}
