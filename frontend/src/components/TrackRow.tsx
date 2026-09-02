import { useState } from 'react';
import { Box, Typography, Avatar, IconButton, Tooltip, LinearProgress, SxProps, Theme } from '@mui/material';
import {
  MusicNote as MusicNoteIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, HighQuality as HqIcon,
  WarningAmber as WarningAmberIcon, MoreVert as MoreVertIcon,
  Favorite as FavoriteIcon, FavoriteBorder as FavoriteBorderIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlaylistVideo } from '../api/youtube';
import { formatDuration, formatGenre, STATUS_ICON, isLowBitrate } from '../pages/PlaylistsPage/utils';
import { useTrackActions } from '../hooks/useTrackActions';
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
  // Lets the caller patch this row's data in its own local list once a
  // "Search for HQ" run finishes — same rationale as onDeleted, but for an
  // update rather than a removal.
  onUpdated?: (video: PlaylistVideo) => void;
  sx?: SxProps<Theme>;
}

// Fixed column widths, shared with PlaylistDetailPage/TrackListHeader.tsx so
// its header labels land exactly above the same columns here — thumbnail
// width, gap, and every subsequent fixed-width column need to match exactly
// for the two to stay pixel-aligned as either one changes.
export const TRACK_ROW_LAYOUT = {
  gap: 1.5, // MUI spacing units (×8px = 12px) — the row's own `gap` below
  thumbnailWidth: 42,
  playsWidth: 70,
  genreWidth: 110,
  durationWidth: 44,
  favouriteWidth: 28,
  // Reserves space for the one icon that can render here (download-status
  // icon or, once done, the low-bitrate warning — the two are mutually
  // exclusive) so the actions column after it never shifts left/right
  // depending on which of those happen to render for a given row.
  utilityClusterWidth: 28,
  actionsWidth: 40,
};

/**
 * The one track row component — every list of playable-from-disk tracks in
 * the app (the playlist detail page, Similar Songs, the syncing feed, All
 * Tracks) renders this, so a track looks and behaves identically no matter
 * where it's listed: same hover pop, same right-click menu, same play
 * button, same badges. See PlaylistDetailPage/TrackRow.tsx for the thin
 * react-window adapter that wraps this for the one list that needs
 * virtualization — that's the only reason a second file exists at all.
 */
export function TrackRow({ video: v, playlistId, isCurrentTrack, isAudioPlaying, onTogglePlay, onDeleted, onUpdated, sx }: TrackRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const trackPlaylistId = v.playlistId ?? playlistId ?? '';
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const {
    searching, handleSearchHq, handleRename, handleToggleFavourite,
  } = useTrackActions({ video: v, playlistId: trackPlaylistId, isCurrentTrack, isAudioPlaying, onTogglePlay, onUpdated });

  return (
    <>
    <Box
      onClick={() => navigate(`/playlists/${trackPlaylistId}/${v.id}`)}
      onContextMenu={(e) => { e.preventDefault(); setMenuPos({ top: e.clientY, left: e.clientX }); }}
      sx={{
        display: 'flex', alignItems: 'center', gap: TRACK_ROW_LAYOUT.gap, px: 1.5,
        position: 'relative', zIndex: 0,
        cursor: 'pointer',
        opacity: v.downloadStatus === 'removed' ? 0.35 : 1,
        bgcolor: isCurrentTrack ? 'action.selected' : 'transparent',
        transition: 'background-color 0.15s ease',
        // Reveals the play/pause overlay button on the thumbnail (see
        // .track-play-overlay below) on hover of the row, not just of the
        // thumbnail itself. pointerEvents flips together with opacity — the
        // button covers the whole thumbnail (inset: 0), so left at 'auto'
        // by default it would silently swallow every click/hover on the
        // thumbnail (including the HQ badge's own Tooltip) even while
        // invisible; 'none' lets those pass through until it's actually shown.
        '&:hover .track-play-overlay': { opacity: 1, pointerEvents: 'auto' },
        // Same fill the sidebar itself uses (background.paper) — currently
        // playing keeps its own selected highlight instead, so hovering it
        // doesn't visually lose that indicator.
        '&:hover': { bgcolor: isCurrentTrack ? 'action.selected' : 'background.paper' },
        ...sx,
      }}
    >
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Avatar src={v.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: TRACK_ROW_LAYOUT.thumbnailWidth, height: 30, borderRadius: 1 }}>
          <MusicNoteIcon sx={{ fontSize: 16 }} />
        </Avatar>
        {(v.hqFileDownloaded || v.betterQualityExists) && (
          <Tooltip title={v.hqFileDownloaded ? t('playlists.videoList.hqDownloaded') : t('playlists.videoList.hqAvailable')}>
            <Box sx={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.45)', borderRadius: 1,
            }}>
              <HqIcon sx={{ fontSize: 18, color: v.hqFileDownloaded ? 'hq.main' : 'grey.300' }} />
            </Box>
          </Tooltip>
        )}
        {/* Hidden by default (opacity: 0) — the row's own hover rule above
            reveals it, overlaying the thumbnail (and any HQ badge showing
            underneath) rather than sitting in its own reserved column. */}
        {v.downloadStatus === 'done' && (
          <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
            <span>
              <IconButton
                className="track-play-overlay"
                disabled={searching}
                onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
                sx={{
                  position: 'absolute', inset: 0, borderRadius: 1, p: 0,
                  bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                  // Actively playing stays visible without needing hover — a
                  // playing track should read as playing at a glance, not
                  // only once the pointer happens to be over it. Every other
                  // row still relies on the row's own hover rule above.
                  opacity: isCurrentTrack && isAudioPlaying ? 1 : 0,
                  pointerEvents: isCurrentTrack && isAudioPlaying ? 'auto' : 'none',
                  transition: 'opacity 0.15s ease',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                }}
              >
                {isCurrentTrack && isAudioPlaying
                  ? <PauseTrackIcon sx={{ fontSize: 20 }} />
                  : <PlayArrowIcon sx={{ fontSize: 20 }} />}
              </IconButton>
            </span>
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
          sx={{ width: TRACK_ROW_LAYOUT.playsWidth, flexShrink: 0, textAlign: 'left', display: { xs: 'none', sm: 'block' } }}>
          {t('artists.detail.totalPlayCount', { count: v.playCount })}
        </Typography>
      )}

      {v.genres.length > 0 && (
        <Tooltip title={v.genres.map(formatGenre).join(', ')}>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ width: TRACK_ROW_LAYOUT.genreWidth, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
            {v.genres.map(formatGenre).join(', ')}
          </Typography>
        </Tooltip>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ width: TRACK_ROW_LAYOUT.durationWidth, flexShrink: 0, textAlign: 'right' }}>
        {formatDuration(v.duration)}
      </Typography>

      <Box sx={{ width: TRACK_ROW_LAYOUT.favouriteWidth, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <Tooltip title={t(v.isFavourite ? 'playlists.videoList.removeFavourite' : 'playlists.videoList.addFavourite')}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleToggleFavourite(); }}>
            {v.isFavourite
              ? <FavoriteIcon sx={{ fontSize: 16, color: 'primary.main' }} />
              : <FavoriteBorderIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ width: TRACK_ROW_LAYOUT.utilityClusterWidth, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
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
      </Box>

      <Box sx={{ width: TRACK_ROW_LAYOUT.actionsWidth, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <Tooltip title={t('playlists.videoList.moreActions')}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setMenuPos({ top: e.clientY, left: e.clientX }); }}>
            <MoreVertIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {searching && (
        <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 }} />
      )}
    </Box>
    <TrackContextMenu
      playlistId={trackPlaylistId}
      video={v}
      position={menuPos}
      onClose={() => setMenuPos(null)}
      onDeleted={onDeleted}
      searching={searching}
      onSearchHq={handleSearchHq}
      onRename={handleRename}
      onToggleFavourite={handleToggleFavourite}
    />
    </>
  );
}
