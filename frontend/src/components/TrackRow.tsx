import { useState } from 'react';
import { Box, Typography, Avatar, IconButton, Tooltip, LinearProgress, SxProps, Theme } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Download as DownloadIcon, YouTube as YouTubeIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, HighQuality as HqIcon,
  WarningAmber as WarningAmberIcon, MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { playlistsApi, PlaylistVideo, CloseHqCandidate } from '../api/youtube';
import { formatDuration, formatGenre, youtubeWatchUrl, STATUS_ICON, isLowBitrate } from '../pages/PlaylistsPage/utils';
import { useToast } from '../contexts/ToastContext';
import { TrackContextMenu } from './TrackContextMenu';
import { CloseHqCandidatesDialog } from './CloseHqCandidatesDialog';

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

// Fixed column widths, shared with PlaylistDetailPage/TrackListHeader.tsx so
// its header labels land exactly above the same columns here — thumbnail
// width, gap, and every subsequent fixed-width column need to match exactly
// for the two to stay pixel-aligned as either one changes.
export const TRACK_ROW_LAYOUT = {
  gap: 1.5, // MUI spacing units (×8px = 12px) — the row's own `gap` below
  thumbnailWidth: 42,
  playsWidth: 70,
  yearWidth: 40,
  genreWidth: 110,
  durationWidth: 44,
  // Reserves space for the busiest real case (low-bitrate warning + YouTube
  // link + MP3 download, right-aligned within it) so the actions column
  // after it never shifts left/right depending on which of those happen to
  // render for a given row.
  utilityClusterWidth: 96,
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
  const { showSuccess, showInfo, showError } = useToast();
  const trackPlaylistId = v.playlistId ?? playlistId ?? '';
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [closeCandidates, setCloseCandidates] = useState<CloseHqCandidate[]>([]);

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
        const { video: fresh, searchingHq, closeHqCandidates } = await playlistsApi.getVideo(trackPlaylistId, v.id);
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
          // Deezer/Qobuz/Tidal turning up real-but-unconfident results is a
          // richer signal than plain "nothing found" — offer them as
          // one-click rename suggestions instead of the plain toast.
          if (closeHqCandidates.length > 0) {
            setCloseCandidates(closeHqCandidates);
          } else {
            showInfo(t('playlists.videoList.hqNotFoundForTrack', { title: fresh.title }));
          }
        }
      } catch {
        // Network hiccup — stop polling silently rather than spin forever.
        setSearching(false);
      }
    };
    setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
  };

  const handleDismissCloseCandidates = () => {
    setCloseCandidates([]);
    playlistsApi.dismissHqCandidates(trackPlaylistId, v.id).catch(() => {});
  };

  // Picking a suggestion is just a rename to that exact artist/title —
  // reuses the row's own rename lifecycle (spinner, disabled menu actions,
  // the "found"/"renamed" toasts from pollForCompletion above) rather than
  // any separate code path.
  const handleSelectCloseCandidate = async (artist: string, title: string) => {
    setCloseCandidates([]);
    try {
      await handleRename(artist, title);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.videoList.renameError'));
    }
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
                  opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s ease',
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

      <Typography variant="caption" color="text.secondary" sx={{ width: TRACK_ROW_LAYOUT.yearWidth, flexShrink: 0, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
        {v.releaseYear ?? ''}
      </Typography>

      {v.genres.length > 0 && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ width: TRACK_ROW_LAYOUT.genreWidth, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
          {v.genres.map(formatGenre).join(', ')}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ width: TRACK_ROW_LAYOUT.durationWidth, flexShrink: 0, textAlign: 'right' }}>
        {formatDuration(v.duration)}
      </Typography>

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
    />
    {closeCandidates.length > 0 && (
      <CloseHqCandidatesDialog
        video={v}
        candidates={closeCandidates}
        onDismiss={handleDismissCloseCandidates}
        onSelect={handleSelectCloseCandidate}
      />
    )}
    </>
  );
}
