import { Accordion, AccordionSummary, AccordionDetails, Paper, Tooltip, IconButton } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Playlist, PlaylistVideo } from '../../../api/youtube';
import { VideoState, NowPlaying } from '../types';
import { VideoList } from '../VideoList';
import { Thumbnail } from './Thumbnail';
import { Info } from './Info';
import { Actions } from './Actions';

interface PlaylistRowProps {
  playlist: Playlist;
  expanded: boolean;
  onToggleExpand: (open: boolean) => void;
  isSyncingLocally: boolean;
  isRetryingLocally: boolean;
  online: boolean;
  canGenerateSimilar: boolean;
  hasGeneratedPlaylist: boolean;
  isLockedBySource: boolean;
  videoCache: Record<string, VideoState>;
  setVideoCache: React.Dispatch<React.SetStateAction<Record<string, VideoState>>>;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo) => void;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
  onGenerateSimilar: (e: React.MouseEvent, playlist: Playlist) => void;
}

export function PlaylistRow({
  playlist, expanded, onToggleExpand, isSyncingLocally, isRetryingLocally, online, canGenerateSimilar,
  hasGeneratedPlaylist, isLockedBySource,
  videoCache, setVideoCache, nowPlaying, isAudioPlaying, onTogglePlay,
  onRename, onSync, onRetryFailed, onTogglePause, onDelete, onGenerateSimilar,
}: PlaylistRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isRetrying = playlist.syncStatus === 'retrying' || isRetryingLocally;
  const isBusy = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || isRetrying || isSyncingLocally;
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const isSynced = !isBusy && playlist.downloadedCount > 0 && playlist.downloadedCount <= playlist.videoCount;
  // No PlaylistVideo rows exist yet during this phase (they're only created
  // once candidate discovery finishes) — expanding would just show a
  // confusing "no videos found" empty state, so don't offer it at all.
  const isGenerating = playlist.syncStatus === 'generating';

  if (isSynced) {
    const open = () => navigate(`/playlists/${playlist.id}`);
    return (
      <Paper onClick={open} elevation={0}
        sx={{ mb: 1, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
          border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
          '&:hover': { borderColor: 'primary.dark' } }}>
        <Thumbnail thumbnailUrl={playlist.thumbnailUrl} />
        <Info playlist={playlist} isBusy={isBusy} isPausing={isPausing} expanded={false} />
        <Actions
          playlist={playlist}
          isBusy={isBusy}
          isPausing={isPausing}
          isRetrying={isRetrying}
          online={online}
          canGenerateSimilar={canGenerateSimilar}
          hasGeneratedPlaylist={hasGeneratedPlaylist}
          isLockedBySource={isLockedBySource}
          onRename={onRename}
          onSync={onSync}
          onRetryFailed={onRetryFailed}
          onTogglePause={onTogglePause}
          onDelete={onDelete}
          onGenerateSimilar={onGenerateSimilar}
        />
        <Tooltip title={t('playlists.openPlaylist')}>
          <IconButton size="small" onClick={e => { e.stopPropagation(); open(); }}>
            <ChevronRightIcon />
          </IconButton>
        </Tooltip>
      </Paper>
    );
  }

  return (
    <Accordion expanded={!isGenerating && expanded}
      onChange={(_, open) => { if (!isGenerating) onToggleExpand(open); }}
      disableGutters
      sx={{ mb: 1, '&:before': { display: 'none' }, border: '1px solid',
        borderColor: expanded ? 'primary.dark' : '#2a2a2a',
        borderRadius: '8px !important', overflow: 'hidden',
        opacity: isPausing ? 0.55 : 1, transition: 'opacity 0.2s' }}>

      <AccordionSummary expandIcon={isGenerating ? undefined : <ExpandMoreIcon />}
        sx={{ px: 2, py: 1, cursor: isGenerating ? 'default' : 'pointer',
          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, minWidth: 0 } }}>

        <Thumbnail thumbnailUrl={playlist.thumbnailUrl} />

        <Info playlist={playlist} isBusy={isBusy} isPausing={isPausing} expanded={expanded} />

        <Actions
          playlist={playlist}
          isBusy={isBusy}
          isPausing={isPausing}
          isRetrying={isRetrying}
          online={online}
          canGenerateSimilar={canGenerateSimilar}
          hasGeneratedPlaylist={hasGeneratedPlaylist}
          isLockedBySource={isLockedBySource}
          onRename={onRename}
          onSync={onSync}
          onRetryFailed={onRetryFailed}
          onTogglePause={onTogglePause}
          onDelete={onDelete}
          onGenerateSimilar={onGenerateSimilar}
        />
      </AccordionSummary>

      <AccordionDetails sx={{ px: 2, pt: 0, pb: 2, maxHeight: 420, overflowY: 'auto' }}>
        {expanded && (
          <VideoList playlistId={playlist.id} cache={videoCache} setCache={setVideoCache}
            nowPlaying={nowPlaying} isAudioPlaying={isAudioPlaying} onTogglePlay={onTogglePlay} />
        )}
      </AccordionDetails>
    </Accordion>
  );
}
