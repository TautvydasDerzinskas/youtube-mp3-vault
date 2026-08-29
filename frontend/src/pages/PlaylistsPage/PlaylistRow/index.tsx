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
  const isBusy = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || isRetrying || isSyncingLocally;
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const isRowPlaying = nowPlaying?.playlistId === playlist.id && isAudioPlaying;

  const open = () => navigate(isBusy ? `/playlists/${playlist.id}/syncing` : `/playlists/${playlist.id}`);

  const playButton = (
    <Tooltip title={isRowPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
      <span>
        <IconButton size="small" disabled={playlist.downloadedCount === 0}
          onClick={e => onPlayFirst(e, playlist)} sx={{ color: 'primary.main', flexShrink: 0 }}>
          {isRowPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </span>
    </Tooltip>
  );

  return (
    <Paper onClick={open} elevation={0}
      sx={{ mb: 1, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
        border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
        opacity: isPausing ? 0.55 : 1, transition: 'opacity 0.2s',
        '&:hover': { borderColor: 'primary.dark' } }}>
      <Box onClick={e => e.stopPropagation()}>{playButton}</Box>
      <Thumbnail thumbnailUrl={playlist.thumbnailUrl} />
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
