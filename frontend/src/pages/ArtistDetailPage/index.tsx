import { useEffect, useState } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { artistsApi, ArtistDetail } from '../../api/artists';
import { Header } from './Header';
import { TrackList } from '../PlaylistDetailPage/TrackList';

export default function ArtistDetailPage() {
  const { t } = useTranslation();
  const { key } = useParams<{ key: string }>();
  const [state, setState] = useState<ArtistDetail | 'loading' | 'error'>('loading');
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  useEffect(() => {
    if (!key) return;
    setState('loading');
    artistsApi.getDetail(key).then(setState).catch(() => setState('error'));
  }, [key]);

  if (state === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (state === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('artists.detail.failedToLoad')}</Alert>;
  }

  const playableTracks = state.videos.filter((v) => v.downloadStatus === 'done');

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header artist={state} />
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <TrackList
          tracks={state.videos}
          playableTracks={playableTracks}
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onTogglePlay={handleTogglePlay}
        />
      </Box>
    </Box>
  );
}
