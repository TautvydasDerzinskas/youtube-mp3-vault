import { useState } from 'react';
import { Box, IconButton, Tooltip, CircularProgress, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import {
  Sync as SyncIcon, DeleteOutline as DeleteIcon, Edit as EditIcon, Replay as ReplayIcon,
  PauseCircleOutline as PauseIcon, PlayCircleOutline as ResumeIcon, MoreVert as MoreVertIcon,
  AutoAwesome as GenerateSimilarIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { useIsMobile } from '../../../hooks/useIsMobile';

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
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
  onGenerateSimilar: (e: React.MouseEvent, playlist: Playlist) => void;
}

export function Actions({
  playlist, isBusy, isPausing, isRetrying, online, canGenerateSimilar, hasGeneratedPlaylist, isLockedBySource,
  onRename, onSync, onRetryFailed, onTogglePause, onDelete, onGenerateSimilar,
}: ActionsProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const isGenerated = Boolean(playlist.sourcePlaylistId);
  const showSync = !isGenerated && !playlist.syncPaused;
  const showRetry = !isGenerated && !playlist.syncPaused && !isBusy && playlist.lastSyncedAt && playlist.failedCount > 0;
  const showPauseToggle = !isGenerated && !isRetrying && (isBusy || playlist.syncPaused);
  // "Synced" here mirrors PlaylistRow/index.tsx's isSynced — only offer this
  // on a playlist that's actually finished downloading something, not one
  // still mid-first-sync or a generated playlist itself.
  const isFullySynced = !isBusy && playlist.downloadedCount > 0 && playlist.downloadedCount <= playlist.videoCount;
  const showGenerateSimilar = !isGenerated && isFullySynced && canGenerateSimilar && !hasGeneratedPlaylist;
  const renameDisabled = isPausing || isBusy || isLockedBySource;
  const syncDisabled = isBusy || !online || isLockedBySource;
  const deleteDisabled = isPausing || isBusy || isLockedBySource;
  const renameTooltip = isBusy ? t('playlists.unavailableWhileSyncing')
    : isLockedBySource ? t('playlists.unavailableWhileGenerating') : t('playlists.rename');
  const deleteTooltip = isBusy ? t('playlists.unavailableWhileSyncing')
    : isLockedBySource ? t('playlists.unavailableWhileGenerating') : t('playlists.remove');

  if (isMobile) {
    const closeMenu = () => setMenuAnchor(null);
    return (
      <Box onClick={e => e.stopPropagation()} sx={{ flexShrink: 0 }}>
        <IconButton size="small" onClick={e => setMenuAnchor(e.currentTarget)} aria-label={t('playlists.moreActions')}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu} onClick={e => e.stopPropagation()}>
          <MenuItem disabled={renameDisabled} onClick={() => { closeMenu(); onRename(playlist); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('playlists.rename')}</ListItemText>
          </MenuItem>
          {showSync && (
            <MenuItem disabled={syncDisabled} onClick={e => { closeMenu(); onSync(e, playlist.id); }}>
              <ListItemIcon>{isBusy ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}</ListItemIcon>
              <ListItemText>{isBusy ? t('playlists.syncing') : t('playlists.syncNow')}</ListItemText>
            </MenuItem>
          )}
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
          {showGenerateSimilar && (
            <MenuItem onClick={e => { closeMenu(); onGenerateSimilar(e, playlist); }}>
              <ListItemIcon><GenerateSimilarIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{t('playlists.generateSimilar')}</ListItemText>
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

  return (
    <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
      <Tooltip title={renameTooltip}>
        <span>
          <IconButton size="small" disabled={renameDisabled}
            onClick={e => { e.stopPropagation(); onRename(playlist); }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {showSync && (
        <Tooltip title={!online ? t('playlists.offlineUnavailable') : isBusy ? t('playlists.syncing') : isLockedBySource ? t('playlists.unavailableWhileGenerating') : t('playlists.syncNow')}>
          <span>
            <IconButton size="small" onClick={e => onSync(e, playlist.id)} disabled={syncDisabled}>
              {isBusy ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      )}
      {showRetry && (
        <Tooltip title={!online ? t('playlists.offlineUnavailable') : t('playlists.retryFailed', { count: playlist.failedCount })}>
          <span>
            <IconButton size="small" onClick={e => onRetryFailed(e, playlist.id)} disabled={!online} sx={{ color: 'error.main' }}>
              <ReplayIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {showPauseToggle && (
        <Tooltip title={!online ? t('playlists.offlineUnavailable') : isPausing ? t('playlists.pausingChip') : playlist.syncPaused ? t('playlists.resumeSync') : t('playlists.pauseSync')}>
          <span>
            <IconButton size="small" disabled={isPausing || !online} onClick={e => onTogglePause(e, playlist)}>
              {playlist.syncPaused ? <ResumeIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
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
      <Tooltip title={deleteTooltip}>
        <span>
          <IconButton size="small" disabled={deleteDisabled} onClick={e => { e.stopPropagation(); onDelete(playlist); }} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
