import { useState } from 'react';
import { Box, IconButton, Tooltip, CircularProgress, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import {
  Sync as SyncIcon, DeleteOutline as DeleteIcon, Edit as EditIcon, Replay as ReplayIcon,
  PauseCircleOutline as PauseIcon, PlayCircleOutline as ResumeIcon, MoreVert as MoreVertIcon,
  AutoAwesome as GenerateSimilarIcon, Launch as OpenIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';

interface ActionsProps {
  playlist: Playlist;
  isBusy: boolean;
  isPausing: boolean;
  // True while a retry-failed pass is running (or about to start) — retrying
  // never re-fetches from YouTube, only drains already-pending videos, so
  // it's never pausable (backend enforces this too, see /pause in
  // routes/youtube.ts — this just keeps the button from appearing at all).
  isRetrying: boolean;
  online: boolean;
  canGenerateSimilar: boolean;
  // True once a similar playlist has already been generated from this one —
  // only one is ever allowed, so the action disappears for good rather than
  // just being disabled.
  hasGeneratedPlaylist: boolean;
  // True while this playlist's own generated derivative is actively being
  // built (still reading this playlist's video list) — rename/delete/sync
  // are disabled for the duration, since any of them could change the very
  // data the generation process is reading.
  isLockedBySource: boolean;
  // Only set for the collapsed "fully synced" row, which otherwise has no
  // other way to reach the detail page from inside the menu (unlike the
  // accordion row, which already expands on click).
  onOpen?: () => void;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
  onGenerateSimilar: (e: React.MouseEvent, playlist: Playlist) => void;
}

// Sync and Generate Similar are the only actions visible directly — everything
// else (Open, Rename, Retry Failed, Pause/Resume, Delete) lives behind the
// trailing "more actions" menu, kept as the very last item in the row.
export function Actions({
  playlist, isBusy, isPausing, isRetrying, online, canGenerateSimilar, hasGeneratedPlaylist, isLockedBySource,
  onOpen, onRename, onSync, onRetryFailed, onTogglePause, onDelete, onGenerateSimilar,
}: ActionsProps) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // A generated playlist has no YouTube playlist behind it — that's the one
  // authoritative signal (unlike sourcePlaylistId, which goes null if the
  // source is later deleted, even though this is still very much a
  // generated playlist).
  const isGenerated = playlist.youtubeId === null;
  const showSync = !isGenerated && !playlist.syncPaused;
  const showRetry = !isGenerated && !playlist.syncPaused && !isBusy && playlist.lastSyncedAt && playlist.failedCount > 0;
  const showPauseToggle = !isGenerated && !isRetrying && (isBusy || playlist.syncPaused);
  // Generating a similar playlist reads this playlist's video list, so it
  // only needs to have actually finished a sync pass at least once — not
  // 100% success. Requiring downloadedCount === videoCount meant a single
  // failed video (routine in a large library) hid this forever, since a
  // playlist with any failures never reaches that exact equality again on
  // its own. lastSyncedAt is only ever null for a playlist that's never
  // completed a sync at all — see downloadPendingVideos.
  const hasCompletedSync = !isBusy && playlist.lastSyncedAt !== null;
  const showGenerateSimilar = !isGenerated && hasCompletedSync && canGenerateSimilar && !hasGeneratedPlaylist;
  const renameDisabled = isPausing || isBusy || isLockedBySource;
  const syncDisabled = isBusy || !online || isLockedBySource;
  const deleteDisabled = isPausing || isBusy || isLockedBySource;

  const closeMenu = () => setMenuAnchor(null);

  return (
    <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
      {showSync && (
        <Tooltip title={!online ? t('playlists.offlineUnavailable') : isBusy ? t('playlists.syncing') : isLockedBySource ? t('playlists.unavailableWhileGenerating') : t('playlists.syncNow')}>
          <span>
            <IconButton size="small" onClick={e => onSync(e, playlist.id)} disabled={syncDisabled}>
              {isBusy ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      )}
      {showGenerateSimilar && (
        <Tooltip title={t('playlists.generateSimilar')}>
          <IconButton size="small" onClick={e => onGenerateSimilar(e, playlist)}>
            <GenerateSimilarIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <IconButton size="small" onClick={e => setMenuAnchor(e.currentTarget)} aria-label={t('playlists.moreActions')}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu} onClick={e => e.stopPropagation()}>
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
    </Box>
  );
}
