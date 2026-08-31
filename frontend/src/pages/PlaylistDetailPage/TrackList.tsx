import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { List, ListImperativeAPI } from 'react-window';
import { useTranslation } from 'react-i18next';
import { PlaylistVideo } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { TrackRow, TrackRowProps } from './TrackRow';
import { TrackListHeader } from './TrackListHeader';

interface TrackListProps {
  tracks: PlaylistVideo[];
  playableTracks: PlaylistVideo[];
  // Fallback only — see TrackRowProps. Omitted entirely when every track
  // already carries its own playlistId (e.g. "All Tracks").
  playlistId?: string;
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
  onDeleted?: (videoId: string) => void;
  onUpdated?: (video: PlaylistVideo) => void;
  listRef?: React.RefObject<ListImperativeAPI>;
  // react-window only learns its real height via an async ResizeObserver —
  // its internal container size is still 0 for the first render or two after
  // mount, which silently breaks the vertical-centering math a scrollToRow
  // call does immediately on mount (see the scroll-to-now-playing effects in
  // PlaylistDetailPage/AllTracksPage, which use this to know when a
  // scrollToRow call can be trusted rather than firing blind against a
  // zero-height container).
  onResize?: (size: { height: number; width: number }) => void;
}

// The row itself renders 8px shorter than this and centers within it (see
// TrackRow.tsx's own sx) — the remaining 8px splits into a 4px gap above and
// below every row, separating them from each other.
const ROW_HEIGHT = 64;

export function TrackList({ tracks, playableTracks, playlistId, nowPlaying, isAudioPlaying, onTogglePlay, onDeleted, onUpdated, listRef, onResize }: TrackListProps) {
  const { t } = useTranslation();

  const rowProps = useMemo((): TrackRowProps => (
    { tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay, onDeleted, onUpdated }
  ), [tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay, onDeleted, onUpdated]);

  if (tracks.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        {t('playlists.detail.noTracks')}
      </Typography>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TrackListHeader />
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <List
          listRef={listRef}
          onResize={onResize}
          rowCount={tracks.length}
          rowHeight={ROW_HEIGHT}
          rowComponent={TrackRow}
          rowProps={rowProps}
          // scrollbarGutter keeps this reserved at a constant width whether
          // or not the list is actually tall enough to scroll right now —
          // without it, a native (non-overlay) scrollbar only narrows the
          // row content once the list overflows, so TrackListHeader (which
          // never scrolls, and so never reserves this space on its own)
          // drifts out of alignment with the rows on long playlists. See its
          // matching scrollbarGutter/overflowY below.
          style={{ height: '100%', width: '100%', scrollbarGutter: 'stable' }}
        />
      </Box>
    </Box>
  );
}
