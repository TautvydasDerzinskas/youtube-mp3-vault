import { Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress, Divider } from '@mui/material';
import {
  Sync as SyncIcon, DeleteOutline as DeleteIcon, Edit as EditIcon, Replay as ReplayIcon,
  PauseCircleOutline as PauseIcon, PlayCircleOutline as ResumeIcon, Launch as OpenIcon, HighQuality as ScanHqIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon, YouTube as YouTubeIcon, AutoAwesome as GenerateSimilarIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { youtubePlaylistUrl } from '../utils';

export interface PlaylistActionsMenuProps {
  playlist: Playlist;
  isBusy: boolean;
  isPausing: boolean;
  // Screen coordinates driving the shared "..."/right-click menu — see
  // Actions.tsx's own doc comment (its trigger button) for why this is
  // position-anchored rather than element-anchored.
  menuPos: { top: number; left: number } | null;
  onMenuPosChange: (pos: { top: number; left: number } | null) => void;
  // True while a retry-failed pass is running (or about to start) — retrying
  // never re-fetches from YouTube, only drains already-pending videos, so
  // it's never pausable (backend enforces this too, see /pause in
  // routes/youtube.ts — this just keeps the button from appearing at all).
  isRetrying: boolean;
  online: boolean;
  // Generate Similar is only offered when a caller passes both of these —
  // omitted entirely (as PlaylistDetailPage's header does today) just hides
  // the menu item, same as any other precondition below.
  canGenerateSimilar?: boolean;
  // True once a similar playlist has already been generated from this one —
  // only one is ever allowed, so the action disappears for good rather than
  // just being disabled.
  hasGeneratedPlaylist?: boolean;
  onGenerateSimilar?: (e: React.MouseEvent, playlist: Playlist) => void;
  // True while this playlist's own generated derivative is actively being
  // built (still reading this playlist's video list) — rename/delete/sync
  // are disabled for the duration, since any of them could change the very
  // data the generation process is reading.
  isLockedBySource: boolean;
  // Only set for the collapsed "fully synced" row, which otherwise has no
  // other way to reach the detail page from inside the menu (unlike the
  // accordion row, which already expands on click) — omitted entirely when
  // rendered from the detail page itself, since there's nowhere else to go.
  onOpen?: () => void;
  // Same play/pause action as the row's own thumbnail overlay (list row) or
  // header button (detail page) — offered here too so the menu is a complete
  // list of everything that can be done with this playlist, not just the
  // overflow of what didn't fit elsewhere.
  isPlaying: boolean;
  canPlayFirst: boolean;
  onPlayFirst: (e: React.MouseEvent, playlist: Playlist) => void;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onScanHq: (e: React.MouseEvent, playlist: Playlist) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
}

/**
 * Sync now / Scan for HQ files / [Generate Similar] / divider / Play /
 * [Open] / Rename / Retry Failed / Pause-Resume / Delete / divider / [Open
 * in YouTube] — the one playlist actions menu, shared by the playlist list
 * row (PlaylistRow/Actions.tsx, which renders just the "..." trigger button
 * around this) and PlaylistDetailPage's own header (which has nowhere to
 * put "Open" and renders its own trigger), so a playlist's menu looks and
 * behaves identically everywhere it's offered.
 */
export function PlaylistActionsMenu({
  playlist, isBusy, isPausing, isRetrying, online, canGenerateSimilar, hasGeneratedPlaylist, isLockedBySource,
  menuPos, onMenuPosChange,
  onOpen, isPlaying, canPlayFirst, onPlayFirst, onRename, onSync, onRetryFailed, onScanHq, onTogglePause, onDelete, onGenerateSimilar,
}: PlaylistActionsMenuProps) {
  const { t } = useTranslation();

  // Sync/pause only make sense for a real YouTube playlist — a generated or
  // created one has nothing to periodically re-fetch from YouTube, so both
  // are hidden for either (not just generated).
  const isImported = playlist.origin === 'imported';
  const showSync = isImported && !playlist.syncPaused;
  // Unlike Sync, this never touches YouTube (retryFailedVideos only resets
  // already-downloaded-once videos stuck at downloadStatus 'failed' back to
  // pending) — so it works the same for a generated playlist as a regular
  // one. It's the only way to retry those at all for a generated playlist:
  // they get exactly one downloadPendingVideos pass during generation, then
  // are excluded from both the weekly cron and (previously) this button, so
  // any transient failure from that one pass — a video that failed but
  // hadn't yet hit MAX_DOWNLOAD_ATTEMPTS — would otherwise sit unresolved
  // forever with nothing left to ever retry it.
  const showRetry = !playlist.syncPaused && !isBusy && playlist.lastSyncedAt && playlist.failedCount > 0;
  // Hidden entirely while actively scanning (not just disabled) — pausing
  // has no effect on a scan in progress (see the comment on scanHqDisabled
  // below: the metadata/quality-check phases never check syncPaused), so
  // offering a control that visually claims to work but doesn't would be
  // actively misleading. Still shown once the scan finishes if syncPaused
  // is left over true from a regular sync paused earlier.
  const showPauseToggle = isImported && !isRetrying && playlist.syncStatus !== 'scanning_hq' && (isBusy || playlist.syncPaused);
  const renameDisabled = isPausing || isBusy || isLockedBySource;
  const syncDisabled = isBusy || !online || isLockedBySource;
  const deleteDisabled = isPausing || isBusy || isLockedBySource;
  // Unlike Sync/Retry Failed, this never touches YouTube and isn't blocked
  // by syncPaused (downloadPendingVideos's metadata/quality-check phases run
  // unconditionally, regardless of pause state) — the only real
  // precondition is not already being busy.
  const scanHqDisabled = isBusy || !online || isLockedBySource;
  // Generating a similar playlist reads this playlist's video list, so it
  // only needs to have actually finished a sync pass at least once — not
  // 100% success. Requiring downloadedCount === videoCount meant a single
  // failed video (routine in a large library) hid this forever, since a
  // playlist with any failures never reaches that exact equality again on
  // its own. lastSyncedAt is only ever null for a playlist that's never
  // completed a sync at all — see downloadPendingVideos. MIN_TRACKS mirrors
  // the same floor startGeneratePlaylist enforces server-side (see its own
  // comment) — too few tracks for Last.fm's similar-tracks signal to mean
  // much, so hidden here rather than left to fail after the fact.
  const MIN_TRACKS_FOR_GENERATE_SIMILAR = 10;
  const hasCompletedSync = !isBusy && playlist.lastSyncedAt !== null;
  const showGenerateSimilar = Boolean(onGenerateSimilar) && playlist.origin !== 'generated' && hasCompletedSync
    && canGenerateSimilar && !hasGeneratedPlaylist && playlist.videoCount >= MIN_TRACKS_FOR_GENERATE_SIMILAR;

  const closeMenu = () => onMenuPosChange(null);

  return (
    <Menu
      open={Boolean(menuPos)}
      onClose={closeMenu}
      anchorReference="anchorPosition"
      anchorPosition={menuPos ?? undefined}
      onClick={e => e.stopPropagation()}
    >
      {showSync && (
        <MenuItem disabled={syncDisabled} onClick={e => { closeMenu(); onSync(e, playlist.id); }}>
          <ListItemIcon>{isBusy ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>
            {isBusy ? (playlist.syncStatus === 'scanning_hq' ? t('playlists.scanningHq') : t('playlists.syncing')) : t('playlists.syncNow')}
          </ListItemText>
        </MenuItem>
      )}
      <MenuItem disabled={scanHqDisabled} onClick={e => { closeMenu(); onScanHq(e, playlist); }}>
        <ListItemIcon><ScanHqIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t('playlists.scanHq')}</ListItemText>
      </MenuItem>
      {showGenerateSimilar && (
        <MenuItem onClick={e => { closeMenu(); onGenerateSimilar!(e, playlist); }}>
          <ListItemIcon><GenerateSimilarIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('playlists.generateSimilar')}</ListItemText>
        </MenuItem>
      )}
      <Divider />
      <MenuItem disabled={!canPlayFirst} onClick={e => { closeMenu(); onPlayFirst(e, playlist); }}>
        <ListItemIcon>{isPlaying ? <PauseTrackIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}</ListItemIcon>
        <ListItemText>{t(isPlaying ? 'playlists.videoList.pause' : 'playlists.videoList.play')}</ListItemText>
      </MenuItem>
      {onOpen && (
        <MenuItem onClick={() => { closeMenu(); onOpen(); }}>
          <ListItemIcon><OpenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('playlists.openPlaylist')}</ListItemText>
        </MenuItem>
      )}
      <MenuItem disabled={renameDisabled} onClick={() => { closeMenu(); onRename(playlist); }}>
        <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t('playlists.rename')}</ListItemText>
      </MenuItem>
      {showRetry && (
        <MenuItem disabled={!online} onClick={e => { closeMenu(); onRetryFailed(e, playlist.id); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><ReplayIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>{t('playlists.retryFailed', { count: playlist.failedCount })}</ListItemText>
        </MenuItem>
      )}
      {showPauseToggle && (
        <MenuItem disabled={isPausing || !online} onClick={e => { closeMenu(); onTogglePause(e, playlist); }}>
          <ListItemIcon>{playlist.syncPaused ? <ResumeIcon fontSize="small" /> : <PauseIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{playlist.syncPaused ? t('playlists.resumeSync') : t('playlists.pauseSync')}</ListItemText>
        </MenuItem>
      )}
      <MenuItem disabled={deleteDisabled} onClick={() => { closeMenu(); onDelete(playlist); }} sx={{ color: 'error.main' }}>
        <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
        <ListItemText>{t('playlists.remove')}</ListItemText>
      </MenuItem>
      {/* A generated ("similar") playlist has no real YouTube playlist behind
          it (see isGenerated above) — nothing to open. */}
      {playlist.youtubeId && (
        <>
          <Divider />
          <MenuItem component="a" href={youtubePlaylistUrl(playlist.youtubeId)} target="_blank" rel="noopener noreferrer" onClick={closeMenu}>
            <ListItemIcon><YouTubeIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('playlists.openInYoutube')}</ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
