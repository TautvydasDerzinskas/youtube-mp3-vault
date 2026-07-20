import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { playlistsApi, PlaylistVideo, RecommendedTrack, RemixResult, DiscoverResult } from '../../../api/youtube';

/**
 * Fetches the four independent pieces of the track detail page in parallel —
 * the track itself, its in-library recommendations, its Last.fm-sourced
 * discover list, and its YouTube remix search — since none of them depend on
 * each other completing first.
 */
export function useTrackDetail() {
  const { id, trackId } = useParams<{ id: string; trackId: string }>();

  const [video, setVideo] = useState<PlaylistVideo | 'loading' | 'error'>('loading');
  const [recommendations, setRecommendations] = useState<RecommendedTrack[] | 'loading' | 'error'>('loading');
  const [discover, setDiscover] = useState<DiscoverResult[] | 'loading' | 'error'>('loading');
  const [remixes, setRemixes] = useState<RemixResult[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!id || !trackId) return;
    setVideo('loading');
    setRecommendations('loading');
    setDiscover('loading');
    setRemixes('loading');

    playlistsApi.getVideo(id, trackId)
      .then(({ video }) => setVideo(video))
      .catch(() => setVideo('error'));
    playlistsApi.getRecommendations(id, trackId)
      .then(({ recommendations }) => setRecommendations(recommendations))
      .catch(() => setRecommendations('error'));
    playlistsApi.getDiscover(id, trackId)
      .then(({ discover }) => setDiscover(discover))
      .catch(() => setDiscover('error'));
    playlistsApi.getRemixes(id, trackId)
      .then(({ remixes }) => setRemixes(remixes))
      .catch(() => setRemixes('error'));
  }, [id, trackId]);

  return { playlistId: id ?? '', video, recommendations, discover, remixes };
}
