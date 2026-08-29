import { Box, CircularProgress, Alert } from '@mui/material';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { useTrackDetail } from './hooks/useTrackDetail';
import { Header } from './Header';
import { RecommendedTracks } from './RecommendedTracks';
import { DiscoverTracks } from './DiscoverTracks';
import { RemixLinks } from './RemixLinks';

export default function TrackDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playlistId, video, recommendations, discover, remixes, usedIn, removeRecommendation, updateRecommendation, updateVideo } = useTrackDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  if (!playlistId) return <Navigate to="/playlists" replace />;

  if (video === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (video === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('playlists.trackDetail.failedToLoad')}</Alert>;
  }

  const isCurrentTrack = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === video.id;

  return (
    <Box sx={{ p: 3 }}>
      <Header
        playlistId={playlistId}
        video={video}
        isCurrentTrack={isCurrentTrack}
        isAudioPlaying={isAudioPlaying}
        onTogglePlay={() => handleTogglePlay(playlistId, video)}
        usedIn={usedIn}
        // This page is that track's own detail view — once it's deleted
        // there's nothing left here to show, so leave rather than keep
        // rendering a now-gone video.
        onDeleted={() => navigate(`/playlists/${playlistId}`)}
        onUpdated={updateVideo}
      />
      <RecommendedTracks state={recommendations} nowPlaying={nowPlaying} isAudioPlaying={isAudioPlaying} onTogglePlay={handleTogglePlay} onDeleted={removeRecommendation} onUpdated={updateRecommendation} />
      <DiscoverTracks state={discover} />
      <RemixLinks state={remixes} />
    </Box>
  );
}
