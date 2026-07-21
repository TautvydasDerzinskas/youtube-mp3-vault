import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { List, ListImperativeAPI } from 'react-window';
import { useTranslation } from 'react-i18next';
import { PlaylistVideo } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { TrackRow, TrackRowProps } from './TrackRow';

interface TrackListProps {
  tracks: PlaylistVideo[];
  playableTracks: PlaylistVideo[];
  // Fallback only — see TrackRowProps. Omitted entirely when every track
  // already carries its own playlistId (e.g. "All Tracks").
  playlistId?: string;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
  listRef?: React.RefObject<ListImperativeAPI>;
}

const ROW_HEIGHT = 56;

export function TrackList({ tracks, playableTracks, playlistId, nowPlaying, isAudioPlaying, onTogglePlay, listRef }: TrackListProps) {
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
    <Box sx={{ height: '100%', border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px', overflow: 'hidden' }}>
      <List
        listRef={listRef}
        rowCount={tracks.length}
        rowHeight={ROW_HEIGHT}
        rowComponent={TrackRow}
        rowProps={rowProps}
        style={{ height: '100%', width: '100%' }}
      />
    </Box>
  );
}
