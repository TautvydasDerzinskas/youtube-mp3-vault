import { useState } from 'react';
import { Box, Typography, Avatar, IconButton, Tooltip, LinearProgress, SxProps, Theme } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, HighQuality as HqIcon,
  WarningAmber as WarningAmberIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON, isLowBitrate } from '../pages/PlaylistsPage/utils';
import { useToast } from '../contexts/ToastContext';
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

// 2s between polls — frequent enough that the row's spinning border doesn't
// linger for long after the search actually finishes, cheap enough (one
// single-video GET) not to matter if a search runs for a while.
const SEARCH_POLL_INTERVAL_MS = 2000;

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
  const { showSuccess, showInfo, showError } = useToast();
  const trackPlaylistId = v.playlistId ?? playlistId ?? '';
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [searching, setSearching] = useState(false);

  // Shared tail end of both Search for HQ and Rename track — polls GET
  // .../videos/:videoId (the same single-video endpoint TrackDetailPage
  // already uses) until its searchingHq field flips back to false — that
  // response already carries whatever changed (bitrate, hqFileDownloaded,
  // mediaFileId, artist, title, ...), so no separate "fetch the updated
  // video" call is needed once it's done. `mode` only controls which
  // toast(s) fire — rename always confirms the rename itself, and either
  // mode reports a newly-found HQ upgrade the same way (search additionally
  // reports "found nothing", which doesn't apply to rename: not finding an
  // HQ upgrade was never rename's main point, so staying quiet about it
  // there avoids implying the rename itself came up short).
  const pollForCompletion = (mode: 'search' | 'rename') => {
    const hadHq = v.hqFileDownloaded || v.betterQualityExists;
    const poll = async () => {
      try {
        const { video: fresh, searchingHq } = await playlistsApi.getVideo(trackPlaylistId, v.id);
        if (searchingHq) {
          setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
          return;
        }
        setSearching(false);
        onUpdated?.(fresh);
        if (mode === 'rename') {
          showSuccess(t('playlists.videoList.trackRenamed', { title: fresh.title }));
        }
        const foundHq = fresh.hqFileDownloaded || fresh.betterQualityExists;
        if (foundHq && !hadHq) {
          showSuccess(t('playlists.videoList.hqFoundForTrack', { title: fresh.title }));
        } else if (mode === 'search' && !foundHq) {
          showInfo(t('playlists.videoList.hqNotFoundForTrack', { title: fresh.title }));
        }
      } catch {
        // Network hiccup — stop polling silently rather than spin forever.
        setSearching(false);
      }
    };
    setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
  };

  const handleSearchHq = async () => {
    // A found-and-replaced file would disrupt playback out from under the
    // user mid-song — stop it up front rather than let that happen silently.
    if (isCurrentTrack && isAudioPlaying) onTogglePlay();

    setSearching(true);
    try {
      await playlistsApi.searchTrackHq(trackPlaylistId, v.id);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.videoList.searchHqError'));
      setSearching(false);
      return;
    }
    pollForCompletion('search');
  };

  // Called from RenameTrackDialog (via TrackContextMenu) — only awaits the
  // initial POST, not the background metadata/HQ-search follow-up it kicks
  // off, so the dialog can close right away and let this row's own spinning
  // border carry the rest of the "in progress" indicator (same one Search
  // for HQ uses). Rethrows on failure so the dialog can show the error
  // inline instead of closing.
  const handleRename = async (artist: string | null, title: string) => {
    if (isCurrentTrack && isAudioPlaying) onTogglePlay();

    setSearching(true);
    try {
      await playlistsApi.renameTrack(trackPlaylistId, v.id, artist, title);
    } catch (err) {
      setSearching(false);
      throw err;
    }
    pollForCompletion('rename');
  };

  return (
    <>
    <Box
      onClick={() => navigate(`/playlists/${trackPlaylistId}/${v.id}`)}
      onContextMenu={(e) => { e.preventDefault(); setMenuPos({ top: e.clientY, left: e.clientX }); }}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5,
        position: 'relative', zIndex: 0,
        borderBottom: '1px solid #2a2a2a', cursor: 'pointer',
        opacity: v.downloadStatus === 'removed' ? 0.35 : 1,
        bgcolor: isCurrentTrack ? 'action.selected' : 'transparent',
        transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          bgcolor: isCurrentTrack ? 'action.selected' : 'action.hover',
          // Only the synced (playable-from-disk) rows get the pop — it's a
          // cue that this row is actually clickable-to-play, not just
          // decoration. translateY (not scale) keeps the row's width
          // unchanged so it can never overflow its container horizontally;
          // lifting it and adding shadow reads as the row floating above its
          // neighbors, which themselves stay put since transforms don't
          // affect layout. The z-index bump keeps it drawing on top of them
          // instead of being clipped by their (equally opaque) backgrounds.
          // Skipped entirely while searching — one animation at a time reads
          // more clearly than two competing.
          ...(v.downloadStatus === 'done' && !searching && { transform: 'translateY(-3px)', zIndex: 1, boxShadow: 6 }),
        },
        ...sx,
      }}
    >
      <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {v.downloadStatus === 'done' && (
          <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
            <span>
              <IconButton disabled={searching} onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} sx={{ color: 'primary.main' }}>
                {isCurrentTrack && isAudioPlaying
                  ? <PauseTrackIcon sx={{ fontSize: 28 }} />
                  : <PlayArrowIcon sx={{ fontSize: 28 }} />}
              </IconButton>
            </span>
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
    />
    </>
  );
}
