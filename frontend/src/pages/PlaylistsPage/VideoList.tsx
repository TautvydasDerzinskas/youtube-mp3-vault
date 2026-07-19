import { useEffect } from 'react';
import {
  Box, Typography, CircularProgress, Alert, IconButton, Tooltip, List, ListItem,
  ListItemAvatar, ListItemText, Avatar, Stack,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, WarningAmber as WarningAmberIcon,
  Verified as VerifiedIcon, SyncProblem as SyncProblemIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../../api/youtube';
import { VideoState, NowPlaying } from './types';
import { formatBytes, formatDuration, youtubeWatchUrl, STATUS_ICON, isLowBitrate } from './utils';

interface VideoListProps {
  playlistId: string;
  cache: Record<string, VideoState>;
  setCache: React.Dispatch<React.SetStateAction<Record<string, VideoState>>>;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo) => void;
}

function mbVerifiedTooltip(v: PlaylistVideo, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const details = [v.artist, v.album, v.genre].filter(Boolean).join(' · ');
  return details ? `${t('playlists.videoList.mbVerified')}: ${details}` : t('playlists.videoList.mbVerified');
}

export function VideoList({ playlistId, cache, setCache, nowPlaying, isAudioPlaying, onTogglePlay }: VideoListProps) {
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

  return (
    <List dense disablePadding>
      {state.map(v => {
        const isCurrentTrack = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === v.id;
        return (
          <ListItem key={v.id} disableGutters
            sx={{ py: 0.4, opacity: v.downloadStatus === 'removed' ? 0.35 : 1,
              bgcolor: isCurrentTrack ? 'action.selected' : 'transparent', borderRadius: 1 }}>
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
                  #{v.position}{v.artist ? ` · ${v.artist}` : ''}{v.genre ? ` · ${v.genre}` : ''}{v.releaseYear ? ` · ${v.releaseYear}` : ''}{!v.isAvailable ? ` · ${t('playlists.videoList.unavailable')}` : ''}{v.fileSize ? ` · ${formatBytes(v.fileSize)}` : ''}{v.downloadStatus === 'done' && v.bitrate ? ` · ${v.bitrate}kbps` : ''}
                </Typography>
              }
            />
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0, ml: 1 }}>
              <Tooltip title={v.downloadStatus === 'failed' && v.downloadError ? v.downloadError : t(`playlists.status.${v.downloadStatus}`)}>
                <Box sx={{ display: 'flex' }}>{STATUS_ICON[v.downloadStatus] ?? null}</Box>
              </Tooltip>
              {v.metadataStatus === 'found' && (
                <Tooltip title={mbVerifiedTooltip(v, t)}>
                  <VerifiedIcon sx={{ fontSize: 16, color: 'success.main' }} />
                </Tooltip>
              )}
              {v.metadataStatus === 'error' && (
                <Tooltip title={t('playlists.videoList.mbError')}>
                  <SyncProblemIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                </Tooltip>
              )}
              {v.downloadStatus === 'done' && isLowBitrate(v.bitrate) && (
                <Tooltip title={t('playlists.videoList.lowQuality', { bitrate: v.bitrate })}>
                  <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                </Tooltip>
              )}
              {v.duration && (
                <Typography variant="caption" color="text.secondary">{formatDuration(v.duration)}</Typography>
              )}
              {v.downloadStatus === 'done' && (
                <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
                  <IconButton size="small" onClick={() => onTogglePlay(playlistId, v)} sx={{ color: 'primary.main' }}>
                    {isCurrentTrack && isAudioPlaying
                      ? <PauseTrackIcon sx={{ fontSize: 18 }} />
                      : <PlayArrowIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
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
