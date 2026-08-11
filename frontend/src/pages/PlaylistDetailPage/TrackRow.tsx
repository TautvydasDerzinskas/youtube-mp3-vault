import { Box, Typography, Avatar, IconButton, Tooltip } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, HighQuality as HqIcon,
} from '@mui/icons-material';
import { RowComponentProps } from 'react-window';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { playlistsApi, PlaylistVideo } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON } from '../PlaylistsPage/utils';

export interface TrackRowProps {
  tracks: PlaylistVideo[];
  // Fallback only — used when a row's own video doesn't carry a playlistId
  // (the normal single-playlist case). A cross-playlist list (e.g. "All
  // Tracks") sets it per-video instead, since rows there don't all belong to
  // the same playlist.
  playlistId?: string;
  playableTracks: PlaylistVideo[];
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
}

export function TrackRow({
  index, style, tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay,
}: RowComponentProps<TrackRowProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const v = tracks[index];
  const trackPlaylistId = v.playlistId ?? playlistId ?? '';
  const isCurrentTrack = nowPlaying?.playlistId === trackPlaylistId && nowPlaying?.videoId === v.id;

  return (
    <Box style={style} onClick={() => navigate(`/playlists/${trackPlaylistId}/${v.id}`)} sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5,
      borderBottom: '1px solid #2a2a2a', cursor: 'pointer',
      bgcolor: isCurrentTrack ? 'action.selected' : 'transparent',
      '&:hover': { bgcolor: isCurrentTrack ? 'action.selected' : 'action.hover' },
    }}>
      <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {v.downloadStatus === 'done' && (
          <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
            <IconButton onClick={(e) => { e.stopPropagation(); onTogglePlay(trackPlaylistId, v, playableTracks); }} sx={{ color: 'primary.main' }}>
              {isCurrentTrack && isAudioPlaying
                ? <PauseTrackIcon sx={{ fontSize: 28 }} />
                : <PlayArrowIcon sx={{ fontSize: 28 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Avatar src={v.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 42, height: 30, borderRadius: 1 }}>
          <MusicNoteIcon sx={{ fontSize: 16 }} />
        </Avatar>
        {(v.hqFileDownloaded || v.betterQualityExists) && (
          <Tooltip title={v.hqFileDownloaded ? t('playlists.videoList.hqDownloaded') : t('playlists.videoList.hqAvailable')}>
            <Box sx={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.45)', borderRadius: 1,
            }}>
              <HqIcon sx={{ fontSize: 18, color: v.hqFileDownloaded ? 'success.main' : 'grey.300' }} />
            </Box>
          </Tooltip>
        )}
      </Box>

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

      {v.playCount > 0 && (
        <Typography variant="caption" color="text.secondary" noWrap
          sx={{ width: 70, flexShrink: 0, textAlign: 'left', display: { xs: 'none', sm: 'block' } }}>
          {t('artists.detail.totalPlayCount', { count: v.playCount })}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ width: 40, flexShrink: 0, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
        {v.releaseYear ?? ''}
      </Typography>

      {v.genres.length > 0 && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ width: 110, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
          {v.genres.map(formatGenre).join(', ')}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ width: 44, flexShrink: 0, textAlign: 'right' }}>
        {formatDuration(v.duration)}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        {v.downloadStatus !== 'done' && (
          <Tooltip title={v.downloadStatus === 'failed' && v.downloadError ? v.downloadError : t(`playlists.status.${v.downloadStatus}`)}>
            <Box sx={{ display: 'flex' }}>{STATUS_ICON[v.downloadStatus] ?? null}</Box>
          </Tooltip>
        )}
        <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
          <IconButton size="small" component="a" href={youtubeWatchUrl(v.youtubeId)} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}>
            <YouTubeIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        {v.downloadStatus === 'done' && (
          <Tooltip title={t('playlists.videoList.downloadMp3')}>
            <IconButton size="small" component="a" href={playlistsApi.downloadUrl(trackPlaylistId, v.id)} download
              onClick={(e) => e.stopPropagation()}>
              <DownloadIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
