import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon, YouTube as YouTubeIcon,
  PlayCircle as PlayCircleIcon, PauseCircle as PauseCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlaylistVideo } from '../../api/youtube';
import { formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON } from '../PlaylistsPage/utils';

interface HeaderProps {
  playlistId: string;
  video: PlaylistVideo;
  isPlayingThis: boolean;
  onTogglePlay: () => void;
}

export function Header({ playlistId, video, isPlayingThis, onTogglePlay }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isPlayable = video.downloadStatus === 'done';

  return (
    <Box sx={{ mb: 4 }}>
      <Tooltip title={t('playlists.trackDetail.backToPlaylist')}>
        <IconButton onClick={() => navigate(`/playlists/${playlistId}`)} sx={{ mb: 1, ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        <Avatar src={video.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 160, height: 120, borderRadius: 2, flexShrink: 0 }}>
          <MusicNoteIcon sx={{ fontSize: 48 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h4" fontWeight={700} sx={{ wordBreak: 'break-word' }}>{video.title}</Typography>
          {video.artist && (
            <Typography variant="h6" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{video.artist}</Typography>
          )}

          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            {video.genres.map((g) => <Chip key={g} size="small" label={formatGenre(g)} />)}
            {video.releaseYear && <Chip size="small" variant="outlined" label={video.releaseYear} />}
            {video.duration && <Chip size="small" variant="outlined" label={formatDuration(video.duration)} />}
          </Stack>

          <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 2 }}>
            {isPlayable ? (
              <Tooltip title={isPlayingThis ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
                <IconButton onClick={onTogglePlay} sx={{ color: 'primary.main' }}>
                  {isPlayingThis
                    ? <PauseCircleIcon sx={{ fontSize: 64 }} />
                    : <PlayCircleIcon sx={{ fontSize: 64 }} />}
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={video.downloadStatus === 'failed' && video.downloadError ? video.downloadError : t(`playlists.status.${video.downloadStatus}`)}>
                <Box sx={{ display: 'flex' }}>{STATUS_ICON[video.downloadStatus] ?? null}</Box>
              </Tooltip>
            )}
            <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
              <IconButton component="a" href={youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer">
                <YouTubeIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
