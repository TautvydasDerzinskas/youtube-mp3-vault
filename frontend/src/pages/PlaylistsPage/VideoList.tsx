import { useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert, List } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../../api/youtube';
import { VideoState, NowPlaying } from './types';
import { TrackRow } from './TrackRow';

interface VideoListProps {
  playlistId: string;
  cache: Record<string, VideoState>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, VideoState>>>;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo) => void;
  retrying?: boolean;
}

export function VideoList({ playlistId, cache, setCache, nowPlaying, isAudioPlaying, onTogglePlay, retrying }: VideoListProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (cache[playlistId]) return;
    setCache(prev => ({ ...prev, [playlistId]: 'loading' }));
    playlistsApi.getVideos(playlistId)
      .then(({ videos }) => setCache(prev => ({ ...prev, [playlistId]: videos })))
      .catch(() => setCache(prev => ({ ...prev, [playlistId]: 'error' })));
  }, [playlistId, cache, setCache]);

  const state = cache[playlistId];

  if (!state || state === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
  }
  if (state === 'error') {
    return <Alert severity="error">{t('playlists.videoList.failedToLoad')}</Alert>;
  }
  if (state.length === 0) {
    return <Typography color="text.secondary">{t('playlists.videoList.empty')}</Typography>;
  }

  // A retry only resets previously-failed rows to pending — already-`done`
  // videos are untouched — so while retrying, everything still worth
  // showing is simply "not done" yet.
  const visible = retrying ? state.filter(v => v.downloadStatus !== 'done') : state;

  if (visible.length === 0) {
    return <Typography color="text.secondary">{t('playlists.videoList.empty')}</Typography>;
  }

  return (
    <List dense disablePadding>
      {retrying && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {t('playlists.videoList.retryingHint')}
        </Typography>
      )}
      {visible.map(v => {
        const isCurrentTrack = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === v.id;
        return (
          <TrackRow key={v.id} playlistId={playlistId} video={v} isCurrentTrack={isCurrentTrack}
            isAudioPlaying={isAudioPlaying} onTogglePlay={() => onTogglePlay(playlistId, v)} />
        );
      })}
    </List>
  );
}
