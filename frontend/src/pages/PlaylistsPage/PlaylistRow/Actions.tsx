import { Box, IconButton, Tooltip, CircularProgress } from '@mui/material';
import {
  Sync as SyncIcon, DeleteOutline as DeleteIcon, Edit as EditIcon, Replay as ReplayIcon,
  PauseCircleOutline as PauseIcon, PlayCircleOutline as ResumeIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';

interface ActionsProps {
  playlist: Playlist;
  isBusy: boolean;
  isPausing: boolean;
  online: boolean;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (e: React.MouseEvent, playlist: Playlist) => void;
}

export function Actions({
  playlist, isBusy, isPausing, online, onRename, onSync, onRetryFailed, onTogglePause, onDelete,
}: ActionsProps) {
  const { t } = useTranslation();

  return (
    <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
      <Tooltip title={t('playlists.rename')}>
        <span>
          <IconButton size="small" disabled={isPausing}
            onClick={e => { e.stopPropagation(); onRename(playlist); }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {!playlist.syncPaused && (
        <Tooltip title={!online ? t('playlists.offlineUnavailable') : isBusy ? t('playlists.syncing') : t('playlists.syncNow')}>
          <span>
            <IconButton size="small" onClick={e => onSync(e, playlist.id)} disabled={isBusy || !online}>
              {isBusy ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      )}
      {!playlist.syncPaused && !isBusy && playlist.lastSyncedAt && playlist.failedCount > 0 && (
        <Tooltip title={!online ? t('playlists.offlineUnavailable') : t('playlists.retryFailed', { count: playlist.failedCount })}>
          <span>
            <IconButton size="small" onClick={e => onRetryFailed(e, playlist.id)} disabled={!online} sx={{ color: 'error.main' }}>
              <ReplayIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
      <Tooltip title={!online ? t('playlists.offlineUnavailable') : isPausing ? t('playlists.pausingChip') : playlist.syncPaused ? t('playlists.resumeSync') : t('playlists.pauseSync')}>
        <span>
          <IconButton size="small" disabled={isPausing || !online} onClick={e => onTogglePause(e, playlist)}>
            {playlist.syncPaused ? <ResumeIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('playlists.remove')}>
        <span>
          <IconButton size="small" disabled={isPausing} onClick={e => onDelete(e, playlist)} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
