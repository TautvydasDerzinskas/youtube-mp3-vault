import { useEffect } from 'react';
import {
  Box, Typography, CircularProgress, Alert, IconButton, Tooltip, List, ListItem,
  ListItemAvatar, ListItemText, Avatar, Stack,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../../api/youtube';
import { VideoState, NowPlaying } from './types';
import { formatBytes, formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON, isLowBitrate } from './utils';

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
          <ListItem key={v.id} disableGutters
            sx={{ py: 0.4, opacity: v.downloadStatus === 'removed' ? 0.35 : 1,
              bgcolor: isCurrentTrack ? 'action.selected' : 'transparent', borderRadius: 1 }}>
            <Box sx={{ width: 44, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              {v.downloadStatus === 'done' && (
                <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
                  <IconButton onClick={() => onTogglePlay(playlistId, v)} sx={{ color: 'primary.main' }}>
                    {isCurrentTrack && isAudioPlaying
                      ? <PauseTrackIcon sx={{ fontSize: 26 }} />
                      : <PlayArrowIcon sx={{ fontSize: 26 }} />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <ListItemAvatar sx={{ minWidth: 48 }}>
              <Avatar src={v.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 38, height: 26, borderRadius: 1 }}>
                <MusicNoteIcon sx={{ fontSize: 14 }} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={v.title}
              primaryTypographyProps={{ variant: 'body2', noWrap: true,
                sx: { textDecoration: v.downloadStatus === 'removed' ? 'line-through' : 'none',
                  fontWeight: isCurrentTrack ? 700 : 400, color: isCurrentTrack ? 'primary.main' : 'inherit' } }}
              secondary={
                <Typography variant="caption" color="text.secondary">
                  #{v.position}{v.artist ? ` · ${v.artist}` : ''}{v.genres.length > 0 ? ` · ${v.genres.map(formatGenre).join(', ')}` : ''}{v.releaseYear ? ` · ${v.releaseYear}` : ''}{v.fileSize ? ` · ${formatBytes(v.fileSize)}` : ''}{v.downloadStatus === 'done' && v.bitrate ? ` · ${v.bitrate}kbps` : ''}{v.playCount > 0 ? ` · ${t('artists.detail.totalPlayCount', { count: v.playCount })}` : ''}
                </Typography>
              }
            />
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0, ml: 1 }}>
              <Tooltip title={v.downloadStatus === 'failed' && v.downloadError ? v.downloadError : t(`playlists.status.${v.downloadStatus}`)}>
                <Box sx={{ display: 'flex' }}>{STATUS_ICON[v.downloadStatus] ?? null}</Box>
              </Tooltip>
              {v.downloadStatus === 'done' && isLowBitrate(v.bitrate) && (
                <Tooltip title={t('playlists.videoList.lowQuality', { bitrate: v.bitrate })}>
                  <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                </Tooltip>
              )}
              {v.duration && (
                <Typography variant="caption" color="text.secondary">{formatDuration(v.duration)}</Typography>
              )}
              <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
                <IconButton size="small" component="a" href={youtubeWatchUrl(v.youtubeId)}
                  target="_blank" rel="noopener noreferrer">
                  <YouTubeIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {v.downloadStatus === 'done' && (
                <Tooltip title={t('playlists.videoList.downloadMp3')}>
                  <IconButton size="small" component="a" href={playlistsApi.downloadUrl(playlistId, v.id)} download>
                    <DownloadIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </ListItem>
        );
      })}
    </List>
  );
}
