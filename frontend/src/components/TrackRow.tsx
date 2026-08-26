import { useState } from 'react';
import { Box, Typography, Avatar, IconButton, Tooltip, SxProps, Theme } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, HighQuality as HqIcon,
  WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON, isLowBitrate } from '../pages/PlaylistsPage/utils';
import { TrackContextMenu } from './TrackContextMenu';

export interface TrackRowProps {
  video: PlaylistVideo;
  // Fallback only — used when the video doesn't carry its own playlistId
  // (the normal single-playlist case, e.g. the playlist detail page). A
  // cross-playlist list (Similar Songs, All Tracks) sets it per-video
  // instead, since rows there don't all belong to the same playlist.
  playlistId?: string;
  isCurrentTrack: boolean;
  isAudioPlaying: boolean;
  onTogglePlay: () => void;
  // Lets the caller drop a deleted track from its own local list immediately
  // — see TrackContextMenu's own doc comment.
  onDeleted?: (videoId: string) => void;
  sx?: SxProps<Theme>;
}

/**
 * The one track row component — every list of playable-from-disk tracks in
 * the app (the playlist detail page, Similar Songs, the syncing feed, All
 * Tracks) renders this, so a track looks and behaves identically no matter
 * where it's listed: same hover pop, same right-click menu, same play
 * button, same badges. See PlaylistDetailPage/TrackRow.tsx for the thin
 * react-window adapter that wraps this for the one list that needs
 * virtualization — that's the only reason a second file exists at all.
 */
export function TrackRow({ video: v, playlistId, isCurrentTrack, isAudioPlaying, onTogglePlay, onDeleted, sx }: TrackRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const trackPlaylistId = v.playlistId ?? playlistId ?? '';
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <>
    <Box
      onClick={() => navigate(`/playlists/${trackPlaylistId}/${v.id}`)}
      onContextMenu={(e) => { e.preventDefault(); setMenuPos({ top: e.clientY, left: e.clientX }); }}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5,
        borderBottom: '1px solid #2a2a2a', cursor: 'pointer',
        opacity: v.downloadStatus === 'removed' ? 0.35 : 1,
        bgcolor: isCurrentTrack ? 'action.selected' : 'transparent',
        transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          bgcolor: isCurrentTrack ? 'action.selected' : 'action.hover',
          // Only the synced (playable-from-disk) rows get the pop — it's a
          // cue that this row is actually clickable-to-play, not just
          // decoration. A transform doesn't affect layout, so it never
          // pushes neighboring rows around; the z-index bump just keeps it
          // drawing on top of them instead of being clipped by their
          // (equally opaque) backgrounds.
          ...(v.downloadStatus === 'done' && { transform: 'scale(1.015)', zIndex: 1, boxShadow: 4 }),
        },
        ...sx,
      }}
    >
      <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {v.downloadStatus === 'done' && (
          <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
            <IconButton onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} sx={{ color: 'primary.main' }}>
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
          sx={{
            textDecoration: v.downloadStatus === 'removed' ? 'line-through' : 'none',
            fontWeight: isCurrentTrack ? 700 : 400, color: isCurrentTrack ? 'primary.main' : 'inherit',
          }}>
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
        {v.downloadStatus === 'done' && isLowBitrate(v.bitrate) && (
          <Tooltip title={t('playlists.videoList.lowQuality', { bitrate: v.bitrate })}>
            <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
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
    <TrackContextMenu
      playlistId={trackPlaylistId}
      video={v}
      position={menuPos}
      onClose={() => setMenuPos(null)}
      onDeleted={onDeleted}
    />
    </>
  );
}
