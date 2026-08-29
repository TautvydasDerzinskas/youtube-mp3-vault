import { useState } from 'react';
import { Paper, Tooltip, IconButton, Box } from '@mui/material';
import { PlayArrow as PlayArrowIcon, Pause as PauseIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { NowPlaying } from '../types';
import { Thumbnail } from './Thumbnail';
import { Info } from './Info';
import { Actions } from './Actions';

interface PlaylistRowProps {
  playlist: Playlist;
  isSyncingLocally: boolean;
  isRetryingLocally: boolean;
  online: boolean;
  canGenerateSimilar: boolean;
  hasGeneratedPlaylist: boolean;
  isLockedBySource: boolean;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onPlayFirst: (e: React.MouseEvent, playlist: Playlist) => void;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onScanHq: (e: React.MouseEvent, playlist: Playlist) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
  onGenerateSimilar: (e: React.MouseEvent, playlist: Playlist) => void;
}

// Every playlist row is just a link now — "openable, not expandable" (no
// more inline accordion + track list). A busy playlist opens onto the
// dedicated SyncingPlaylistDetailPage (live progress, no sort/filter/search
// controls, since those don't make sense against a list still being mutated
// under you); anything else opens onto the normal PlaylistDetailPage.
export function PlaylistRow({
  playlist, isSyncingLocally, isRetryingLocally, online, canGenerateSimilar,
  hasGeneratedPlaylist, isLockedBySource,
  nowPlaying, isAudioPlaying, onPlayFirst,
  onRename, onSync, onRetryFailed, onScanHq, onTogglePause, onDelete, onGenerateSimilar,
}: PlaylistRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isRetrying = playlist.syncStatus === 'retrying' || isRetryingLocally;
  const isBusy = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating'
    || playlist.syncStatus === 'scanning_hq' || isRetrying || isSyncingLocally;
  // Deliberately excludes 'scanning_hq' — pausing doesn't affect a scan in
  // progress (see PlaylistActionsMenu's showPauseToggle), so this row
  // shouldn't dim/show "Pausing…" for a run the pause flag can't touch.
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const isRowPlaying = nowPlaying?.playlistId === playlist.id && isAudioPlaying;
  // Screen coordinates driving the shared "..."/right-click menu — see
  // Actions.tsx's own doc comment on the props this feeds.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const open = () => navigate(isBusy ? `/playlists/${playlist.id}/syncing` : `/playlists/${playlist.id}`);

  return (
    <Paper onClick={open}
      onContextMenu={e => { e.preventDefault(); setMenuPos({ top: e.clientY, left: e.clientX }); }}
      elevation={0}
      sx={{ mb: 1, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
        borderRadius: '8px',
        opacity: isPausing ? 0.55 : 1, transition: 'background-color 0.2s, opacity 0.2s',
        // Reveals the play/pause overlay button on the thumbnail (see
        // .playlist-play-overlay below) on hover of the row, matching
        // TrackRow's own thumbnail-hover play button.
        '&:hover .playlist-play-overlay': { opacity: 1, pointerEvents: 'auto' },
        '&:hover': { bgcolor: 'action.hover' } }}>
      <Box sx={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <Thumbnail thumbnailUrl={playlist.thumbnailUrl} />
        <Tooltip title={isRowPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
          <span>
            <IconButton
              className="playlist-play-overlay"
              disabled={playlist.downloadedCount === 0}
              onClick={e => onPlayFirst(e, playlist)}
              sx={{
                position: 'absolute', inset: 0, borderRadius: 1, p: 0,
                bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s ease',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
              }}
            >
              {isRowPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Info playlist={playlist} isBusy={isBusy} isPausing={isPausing} />
      <Actions
        playlist={playlist}
        isBusy={isBusy}
        isPausing={isPausing}
        isRetrying={isRetrying}
        online={online}
        canGenerateSimilar={canGenerateSimilar}
        hasGeneratedPlaylist={hasGeneratedPlaylist}
        isLockedBySource={isLockedBySource}
        menuPos={menuPos}
        onMenuPosChange={setMenuPos}
        onOpen={open}
        onRename={onRename}
        onSync={onSync}
        onRetryFailed={onRetryFailed}
        onScanHq={onScanHq}
        onTogglePause={onTogglePause}
        onDelete={onDelete}
        onGenerateSimilar={onGenerateSimilar}
      />
    </Paper>
  );
}
