import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { List } from 'react-window';
import { useTranslation } from 'react-i18next';
import { PlaylistVideo } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { TrackRow, TrackRowProps } from './TrackRow';

interface TrackListProps {
  tracks: PlaylistVideo[];
  playableTracks: PlaylistVideo[];
  playlistId: string;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
}

const ROW_HEIGHT = 56;

/**
 * Virtualized (react-window) — this page is built for playlists in the
 * thousands-of-tracks range, where mounting one DOM row per track would
 * visibly stall scrolling and initial render.
 */
export function TrackList({ tracks, playableTracks, playlistId, nowPlaying, isAudioPlaying, onTogglePlay }: TrackListProps) {
  const { t } = useTranslation();

  const rowProps = useMemo((): TrackRowProps => (
    { tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay }
  ), [tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay]);

  if (tracks.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        {t('playlists.detail.noTracks')}
      </Typography>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px', overflow: 'hidden' }}>
      <List
        rowCount={tracks.length}
        rowHeight={ROW_HEIGHT}
        rowComponent={TrackRow}
        rowProps={rowProps}
        style={{ height: '100%', width: '100%' }}
      />
    </Box>
  );
}
