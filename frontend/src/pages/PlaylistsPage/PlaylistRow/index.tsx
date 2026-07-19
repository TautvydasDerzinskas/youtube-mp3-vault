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
  online: boolean;
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
}

export function PlaylistRow({
  playlist, expanded, onToggleExpand, isSyncingLocally, online,
  videoCache, setVideoCache, nowPlaying, isAudioPlaying, onTogglePlay,
  onRename, onSync, onRetryFailed, onTogglePause, onDelete,
}: PlaylistRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isBusy = playlist.syncStatus === 'syncing' || isSyncingLocally;
  // syncPaused flips true the instant Pause is clicked, but the background loop
  // only stops once the in-flight video finishes — until then syncStatus is
  // still 'syncing'. Treat that gap as its own "pausing" transitional state.
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const fullySynced = !isBusy && playlist.videoCount > 0 && playlist.downloadedCount === playlist.videoCount;

  // Fully-synced playlists get a dedicated detail page instead of the inline
  // expand-to-preview accordion — there's a full track browser/genre filter
  // waiting for them there, so previewing a handful of rows inline isn't useful.
  if (fullySynced) {
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
          online={online}
          onRename={onRename}
          onSync={onSync}
          onRetryFailed={onRetryFailed}
          onTogglePause={onTogglePause}
          onDelete={onDelete}
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
    <Accordion expanded={expanded}
      onChange={(_, open) => onToggleExpand(open)}
      disableGutters
      sx={{ mb: 1, '&:before': { display: 'none' }, border: '1px solid',
        borderColor: expanded ? 'primary.dark' : '#2a2a2a',
        borderRadius: '8px !important', overflow: 'hidden',
        opacity: isPausing ? 0.55 : 1, transition: 'opacity 0.2s' }}>

      <AccordionSummary expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2, py: 1, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, minWidth: 0 } }}>

        <Thumbnail thumbnailUrl={playlist.thumbnailUrl} />

        <Info playlist={playlist} isBusy={isBusy} isPausing={isPausing} expanded={expanded} />

        <Actions
          playlist={playlist}
          isBusy={isBusy}
          isPausing={isPausing}
          online={online}
          onRename={onRename}
          onSync={onSync}
          onRetryFailed={onRetryFailed}
          onTogglePause={onTogglePause}
          onDelete={onDelete}
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
