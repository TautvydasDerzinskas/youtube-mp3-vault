import { useEffect, useState } from 'react';
import {
  playlistsApi, PlaylistVideo, RecommendedTrack, RemixResult, DiscoverResult, UsedInPlaylist,
} from '../../api/playlists';

// Mirrors frontend/src/pages/TrackDetailPage/hooks/useTrackDetail.ts.
export function useTrackDetail(playlistId: string, trackId: string) {
  const [video, setVideo] = useState<PlaylistVideo | 'loading' | 'error'>('loading');
  const [recommendations, setRecommendations] = useState<RecommendedTrack[] | 'loading' | 'error'>('loading');
  const [discover, setDiscover] = useState<DiscoverResult[] | 'loading' | 'error' | 'disabled'>('loading');
  const [remixes, setRemixes] = useState<RemixResult[] | 'loading' | 'error'>('loading');
  const [usedIn, setUsedIn] = useState<UsedInPlaylist[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    setVideo('loading');
    setRecommendations('loading');
    setDiscover('loading');
    setRemixes('loading');
    setUsedIn('loading');

    playlistsApi.getVideo(playlistId, trackId).then(({ video: v }) => setVideo(v)).catch(() => setVideo('error'));
    playlistsApi.getRecommendations(playlistId, trackId)
      .then(({ recommendations: r }) => setRecommendations(r))
      .catch(() => setRecommendations('error'));
    playlistsApi.getDiscover(playlistId, trackId)
      .then(({ enabled, discover: d }) => setDiscover(enabled ? d : 'disabled'))
      .catch(() => setDiscover('error'));
    playlistsApi.getRemixes(playlistId, trackId)
      .then(({ remixes: r }) => setRemixes(r))
      .catch(() => setRemixes('error'));
    playlistsApi.getUsedIn(playlistId, trackId)
      .then(({ usedIn: u }) => setUsedIn(u))
      .catch(() => setUsedIn('error'));
  }, [playlistId, trackId]);

  return { video, recommendations, discover, remixes, usedIn };
}
