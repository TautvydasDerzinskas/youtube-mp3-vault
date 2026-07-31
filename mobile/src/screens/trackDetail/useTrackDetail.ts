import { useEffect, useState } from 'react';
import { playlistsApi, PlaylistVideo, RecommendedTrack } from '../../api/playlists';

// Mirrors frontend/src/pages/TrackDetailPage/hooks/useTrackDetail.ts, trimmed
// to what's built here — getVideo + getRecommendations only. Discover/
// Remixes/UsedIn aren't ported yet (no mobile UI section for them).
export function useTrackDetail(playlistId: string, trackId: string) {
  const [video, setVideo] = useState<PlaylistVideo | 'loading' | 'error'>('loading');
  const [recommendations, setRecommendations] = useState<RecommendedTrack[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    setVideo('loading');
    setRecommendations('loading');
    playlistsApi.getVideo(playlistId, trackId).then(({ video: v }) => setVideo(v)).catch(() => setVideo('error'));
    playlistsApi.getRecommendations(playlistId, trackId)
      .then(({ recommendations: r }) => setRecommendations(r))
      .catch(() => setRecommendations('error'));
  }, [playlistId, trackId]);

  return { video, recommendations };
}
