import { Box, IconButton } from '@mui/material';
import { MoreVert as MoreVertIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { PlaylistActionsMenu } from './PlaylistActionsMenu';

interface ActionsProps {
  playlist: Playlist;
  isBusy: boolean;
  isPausing: boolean;
  // Screen coordinates driving the shared "..."/right-click menu — lifted up
  // to PlaylistRow so its own onContextMenu (anywhere on the row, not just
  // this button) can open the exact same menu, mirroring TrackContextMenu.
  menuPos: { top: number; left: number } | null;
  onMenuPosChange: (pos: { top: number; left: number } | null) => void;
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
  isPlaying: boolean;
  canPlayFirst: boolean;
  onPlayFirst: (e: React.MouseEvent, playlist: Playlist) => void;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onScanHq: (e: React.MouseEvent, playlist: Playlist) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
  onGenerateSimilar: (e: React.MouseEvent, playlist: Playlist) => void;
}

// The "..." trigger button plus the shared PlaylistActionsMenu it opens —
// every action (Sync, Scan HQ, Generate Similar, Play, Rename, Retry Failed,
// Pause/Resume, Delete, Open in YouTube) lives in that one menu, kept as the
// very last item in the row.
export function Actions({
  playlist, isBusy, isPausing, isRetrying, online, canGenerateSimilar, hasGeneratedPlaylist, isLockedBySource,
  menuPos, onMenuPosChange,
  onOpen, isPlaying, canPlayFirst, onPlayFirst, onRename, onSync, onRetryFailed, onScanHq, onTogglePause, onDelete, onGenerateSimilar,
}: ActionsProps) {
  const { t } = useTranslation();

  return (
    <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
      <IconButton size="small" onClick={e => onMenuPosChange({ top: e.clientY, left: e.clientX })} aria-label={t('playlists.moreActions')}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <PlaylistActionsMenu
        playlist={playlist}
        isBusy={isBusy}
        isPausing={isPausing}
        isRetrying={isRetrying}
        online={online}
        canGenerateSimilar={canGenerateSimilar}
        hasGeneratedPlaylist={hasGeneratedPlaylist}
        isLockedBySource={isLockedBySource}
        menuPos={menuPos}
        onMenuPosChange={onMenuPosChange}
        onOpen={onOpen}
        isPlaying={isPlaying}
        canPlayFirst={canPlayFirst}
        onPlayFirst={onPlayFirst}
        onRename={onRename}
        onSync={onSync}
        onRetryFailed={onRetryFailed}
        onScanHq={onScanHq}
        onTogglePause={onTogglePause}
        onDelete={onDelete}
        onGenerateSimilar={onGenerateSimilar}
      />
    </Box>
  );
}
