import { Box, CircularProgress, Alert } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { useTrackDetail } from './hooks/useTrackDetail';
import { Header } from './Header';
import { RecommendedTracks } from './RecommendedTracks';
import { DiscoverTracks } from './DiscoverTracks';
import { RemixLinks } from './RemixLinks';

export default function TrackDetailPage() {
  const { t } = useTranslation();
  const { playlistId, video, recommendations, discover, remixes } = useTrackDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  if (!playlistId) return <Navigate to="/playlists" replace />;

  if (video === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (video === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('playlists.trackDetail.failedToLoad')}</Alert>;
  }

  const isPlayingThis = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === video.id && isAudioPlaying;

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Header
        playlistId={playlistId}
        video={video}
        isPlayingThis={isPlayingThis}
        onTogglePlay={() => handleTogglePlay(playlistId, video)}
      />
      <RecommendedTracks state={recommendations} nowPlaying={nowPlaying} isAudioPlaying={isAudioPlaying} onTogglePlay={handleTogglePlay} />
      <DiscoverTracks state={discover} />
      <RemixLinks state={remixes} />
    </Box>
  );
}
