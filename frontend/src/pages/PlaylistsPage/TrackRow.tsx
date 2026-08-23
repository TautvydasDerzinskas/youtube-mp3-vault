import type { ElementType } from 'react';
import {
  Box, Typography, IconButton, Tooltip, ListItem, ListItemButton,
  ListItemAvatar, ListItemText, Avatar, Stack, SxProps, Theme,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, WarningAmber as WarningAmberIcon,
  HighQuality as HqIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../../api/youtube';
import { formatBytes, formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON, isLowBitrate } from './utils';

interface TrackRowProps {
  playlistId: string;
  video: PlaylistVideo;
  isCurrentTrack: boolean;
  isAudioPlaying: boolean;
  onTogglePlay: () => void;
  // Renders as a clickable row (e.g. Similar Songs, navigating to the track
  // detail page) rather than a plain, non-clickable list item (the playlist
  // page's own track list, where the row itself does nothing on click and
  // every action lives in its own icon button).
  onClick?: () => void;
  sx?: SxProps<Theme>;
}

/**
 * One track row — shared verbatim between the playlist page's expanded
 * track list and the track detail page's "Similar songs" section, so a
 * track looks and behaves identically (HQ badge, status icon, controls)
 * regardless of where it's listed.
 */
export function TrackRow({ playlistId, video: v, isCurrentTrack, isAudioPlaying, onTogglePlay, onClick, sx }: TrackRowProps) {
  const { t } = useTranslation();
  const ListItemComponent: ElementType = onClick ? ListItemButton : ListItem;

  return (
    <ListItemComponent
      {...(onClick ? { onClick } : {})}
      disableGutters
      sx={{
        py: 0.4, opacity: v.downloadStatus === 'removed' ? 0.35 : 1,
        bgcolor: isCurrentTrack ? 'action.selected' : 'transparent', borderRadius: 1,
        ...sx,
      }}
    >
      <Box sx={{ width: 44, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {v.downloadStatus === 'done' && (
          <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
            <IconButton onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} sx={{ color: 'primary.main' }}>
              {isCurrentTrack && isAudioPlaying
                ? <PauseTrackIcon sx={{ fontSize: 26 }} />
                : <PlayArrowIcon sx={{ fontSize: 26 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <ListItemAvatar sx={{ minWidth: 48 }}>
        <Box sx={{ position: 'relative', width: 38, height: 26 }}>
          <Avatar src={v.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 38, height: 26, borderRadius: 1 }}>
            <MusicNoteIcon sx={{ fontSize: 14 }} />
          </Avatar>
          {(v.hqFileDownloaded || v.betterQualityExists) && (
            <Tooltip title={v.hqFileDownloaded ? t('playlists.videoList.hqDownloaded') : t('playlists.videoList.hqAvailable')}>
              <Box sx={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'rgba(0,0,0,0.45)', borderRadius: 1,
              }}>
                <HqIcon sx={{ fontSize: 16, color: v.hqFileDownloaded ? 'success.main' : 'grey.300' }} />
              </Box>
            </Tooltip>
          )}
        </Box>
      </ListItemAvatar>
      <ListItemText
        primary={v.title}
        primaryTypographyProps={{ variant: 'body2', noWrap: true,
          sx: { textDecoration: v.downloadStatus === 'removed' ? 'line-through' : 'none',
            fontWeight: isCurrentTrack ? 700 : 400, color: isCurrentTrack ? 'primary.main' : 'inherit' } }}
        secondary={
          <Typography variant="caption" color="text.secondary">
            #{v.position}{v.artist ? ` · ${v.artist}` : ''}{v.releaseYear ? ` · ${v.releaseYear}` : ''}{v.genres.length > 0 ? ` · ${v.genres.map(formatGenre).join(', ')}` : ''}{v.fileSize ? ` · ${formatBytes(v.fileSize)}` : ''}{v.downloadStatus === 'done' && v.bitrate ? ` · ${v.bitrate}kbps` : ''}
          </Typography>
        }
      />
      {v.playCount > 0 && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0, textAlign: 'left', ml: 1 }}>
          {t('artists.detail.totalPlayCount', { count: v.playCount })}
        </Typography>
      )}
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
            target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <YouTubeIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        {v.downloadStatus === 'done' && (
          <Tooltip title={t('playlists.videoList.downloadMp3')}>
            <IconButton size="small" component="a" href={playlistsApi.downloadUrl(playlistId, v.id)} download
              onClick={(e) => e.stopPropagation()}>
              <DownloadIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </ListItemComponent>
  );
}
