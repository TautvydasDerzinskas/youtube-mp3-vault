import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip, CircularProgress } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon, YouTube as YouTubeIcon,
  PlayCircle as PlayCircleIcon, PauseCircle as PauseCircleIcon, Download as DownloadIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { playlistsApi, PlaylistVideo, UsedInPlaylist } from '../../api/youtube';
import { formatDuration, formatGenre, normalizeGenreKey, youtubeWatchUrl, allTracksGenreUrl, artistUrl, STATUS_ICON } from '../PlaylistsPage/utils';

interface HeaderProps {
  playlistId: string;
  video: PlaylistVideo;
  isPlayingThis: boolean;
  onTogglePlay: () => void;
  usedIn: UsedInPlaylist[] | 'loading' | 'error';
}

export function Header({ playlistId, video, isPlayingThis, onTogglePlay, usedIn }: HeaderProps) {
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

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
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
            <Box sx={{ display: 'flex', width: 64, justifyContent: 'center' }}>{STATUS_ICON[video.downloadStatus] ?? null}</Box>
          </Tooltip>
        )}

        <Avatar src={video.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 160, height: 120, borderRadius: 2, flexShrink: 0, ml: 1 }}>
          <MusicNoteIcon sx={{ fontSize: 48 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1, ml: 2 }}>
          <Typography variant="h4" fontWeight={700} sx={{ wordBreak: 'break-word' }}>{video.title}</Typography>
          {video.artist && (
            <Typography
              variant="h6"
              color="text.secondary"
              onClick={() => navigate(artistUrl(video.artist!))}
              sx={{
                wordBreak: 'break-word', cursor: 'pointer', width: 'fit-content',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {video.artist}
            </Typography>
          )}

          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            {video.duration && <Chip size="small" variant="outlined" label={formatDuration(video.duration)} />}
            <Chip size="small" variant="outlined" label={t('artists.detail.totalPlayCount', { count: video.playCount })} />
          </Stack>

          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
            {video.genres.map((g) => (
              <Chip key={g} size="small" clickable label={formatGenre(g)} onClick={() => navigate(allTracksGenreUrl(normalizeGenreKey(g)))} />
            ))}
            {video.releaseYear && <Chip size="small" variant="outlined" label={video.releaseYear} />}
          </Stack>

          {usedIn === 'loading' ? (
            <Box sx={{ display: 'flex', mt: 1.5 }}><CircularProgress size={16} /></Box>
          ) : usedIn !== 'error' && usedIn.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                {t('artists.detail.appearsIn')}
              </Typography>
              <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
                {usedIn.map((p) => (
                  <Chip
                    key={p.id}
                    size="small"
                    variant="outlined"
                    clickable
                    label={p.title}
                    onClick={() => navigate(`/playlists/${p.id}`)}
                    avatar={
                      <Avatar src={p.thumbnailUrl ?? undefined}>
                        <MusicNoteIcon sx={{ fontSize: 14 }} />
                      </Avatar>
                    }
                  />
                ))}
              </Stack>
            </Box>
          )}

          <Stack direction="row" gap={1} alignItems="center" sx={{ mt: 2 }}>
            <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
              <IconButton component="a" href={youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer">
                <YouTubeIcon />
              </IconButton>
            </Tooltip>
            {isPlayable && (
              <Tooltip title={t('playlists.videoList.downloadMp3')}>
                <IconButton component="a" href={playlistsApi.downloadUrl(playlistId, video.id)} download>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
