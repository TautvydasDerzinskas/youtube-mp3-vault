import { Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
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
  const isBusy = playlist.syncStatus === 'syncing' || isSyncingLocally;
  // syncPaused flips true the instant Pause is clicked, but the background loop
  // only stops once the in-flight video finishes — until then syncStatus is
  // still 'syncing'. Treat that gap as its own "pausing" transitional state.
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';

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
