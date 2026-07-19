import { Box, Typography, Avatar, IconButton, Tooltip } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, Verified as VerifiedIcon,
  SyncProblem as SyncProblemIcon,
} from '@mui/icons-material';
import { RowComponentProps } from 'react-window';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { formatDuration, youtubeWatchUrl, STATUS_ICON } from '../PlaylistsPage/utils';

export interface TrackRowProps {
  tracks: PlaylistVideo[];
  playlistId: string;
  playableTracks: PlaylistVideo[];
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
}

export function TrackRow({
  index, style, tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay,
}: RowComponentProps<TrackRowProps>) {
  const { t } = useTranslation();
  const v = tracks[index];
  const isCurrentTrack = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === v.id;

  return (
    <Box style={style} sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5,
      borderBottom: '1px solid #2a2a2a',
      bgcolor: isCurrentTrack ? 'action.selected' : 'transparent',
    }}>
      <Avatar src={v.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 42, height: 30, borderRadius: 1, flexShrink: 0 }}>
        <MusicNoteIcon sx={{ fontSize: 16 }} />
      </Avatar>

      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="body2" noWrap
          sx={{ fontWeight: isCurrentTrack ? 700 : 400, color: isCurrentTrack ? 'primary.main' : 'inherit' }}>
          {v.title}
        </Typography>
        {v.artist && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {v.artist}
          </Typography>
        )}
      </Box>

      {v.genre && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ width: 110, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
          {v.genre}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ width: 40, flexShrink: 0, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
        {v.releaseYear ?? ''}
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ width: 44, flexShrink: 0, textAlign: 'right' }}>
        {formatDuration(v.duration)}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        {v.metadataStatus === 'found' && (
          <Tooltip title={t('playlists.videoList.mbVerified')}>
            <VerifiedIcon sx={{ fontSize: 16, color: 'success.main' }} />
          </Tooltip>
        )}
        {v.metadataStatus === 'error' && (
          <Tooltip title={t('playlists.videoList.mbError')}>
            <SyncProblemIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
          </Tooltip>
        )}
        {v.downloadStatus !== 'done' && (
          <Tooltip title={v.downloadStatus === 'failed' && v.downloadError ? v.downloadError : t(`playlists.status.${v.downloadStatus}`)}>
            <Box sx={{ display: 'flex' }}>{STATUS_ICON[v.downloadStatus] ?? null}</Box>
          </Tooltip>
        )}
        {v.downloadStatus === 'done' && (
          <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
            <IconButton size="small" onClick={() => onTogglePlay(playlistId, v, playableTracks)} sx={{ color: 'primary.main' }}>
              {isCurrentTrack && isAudioPlaying
                ? <PauseTrackIcon sx={{ fontSize: 18 }} />
                : <PlayArrowIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
          <IconButton size="small" component="a" href={youtubeWatchUrl(v.youtubeId)} target="_blank" rel="noopener noreferrer">
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
      </Box>
    </Box>
  );
}
