import { Menu, MenuItem, ListItemIcon, ListItemText, CircularProgress, Divider } from '@mui/material';
import {
  Sync as SyncIcon, DeleteOutline as DeleteIcon, Edit as EditIcon, Replay as ReplayIcon,
  PauseCircleOutline as PauseIcon, PlayCircleOutline as ResumeIcon, Launch as OpenIcon, HighQuality as ScanHqIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';

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
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onScanHq: (e: React.MouseEvent, playlist: Playlist) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
}

/**
 * Sync now / Scan for HQ files / divider / [Open] / Rename / Retry Failed /
 * Pause-Resume / Delete — the one playlist actions menu, shared by the
 * playlist list row (PlaylistRow/Actions.tsx, which also renders the visible
 * Generate Similar icon and the "..." trigger button around this) and
 * PlaylistDetailPage's own header (which has nowhere to put "Open" and
 * renders its own trigger), so a playlist's menu looks and behaves
 * identically everywhere it's offered.
 */
export function PlaylistActionsMenu({
  playlist, isBusy, isPausing, isRetrying, online, isLockedBySource,
  menuPos, onMenuPosChange,
  onOpen, onRename, onSync, onRetryFailed, onScanHq, onTogglePause, onDelete,
}: PlaylistActionsMenuProps) {
  const { t } = useTranslation();

  // A generated playlist has no YouTube playlist behind it — that's the one
  // authoritative signal (unlike sourcePlaylistId, which goes null if the
  // source is later deleted, even though this is still very much a
  // generated playlist).
  const isGenerated = playlist.youtubeId === null;
  const showSync = !isGenerated && !playlist.syncPaused;
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
  const showPauseToggle = !isGenerated && !isRetrying && (isBusy || playlist.syncPaused);
  const renameDisabled = isPausing || isBusy || isLockedBySource;
  const syncDisabled = isBusy || !online || isLockedBySource;
  const deleteDisabled = isPausing || isBusy || isLockedBySource;
  // Unlike Sync/Retry Failed, this never touches YouTube and isn't blocked
  // by syncPaused (downloadPendingVideos's metadata/quality-check phases run
  // unconditionally, regardless of pause state) — the only real
  // precondition is not already being busy.
  const scanHqDisabled = isBusy || !online || isLockedBySource;

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
          <ListItemText>{isBusy ? t('playlists.syncing') : t('playlists.syncNow')}</ListItemText>
        </MenuItem>
      )}
      <MenuItem disabled={scanHqDisabled} onClick={e => { closeMenu(); onScanHq(e, playlist); }}>
        <ListItemIcon><ScanHqIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t('playlists.scanHq')}</ListItemText>
      </MenuItem>
      <Divider />
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
    </Menu>
  );
}
