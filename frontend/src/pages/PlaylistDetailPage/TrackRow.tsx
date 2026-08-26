import { Box } from '@mui/material';
import { RowComponentProps } from 'react-window';
import { PlaylistVideo } from '../../api/youtube';
import { NowPlaying } from '../PlaylistsPage/types';
import { TrackRow as TrackRowContent } from '../../components/TrackRow';

export interface TrackRowProps {
  tracks: PlaylistVideo[];
  // Fallback only — used when a row's own video doesn't carry a playlistId
  // (the normal single-playlist case). A cross-playlist list (e.g. "All
  // Tracks") sets it per-video instead, since rows there don't all belong to
  // the same playlist.
  playlistId?: string;
  playableTracks: PlaylistVideo[];
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
  onDeleted?: (videoId: string) => void;
  onUpdated?: (video: PlaylistVideo) => void;
}

// Thin react-window adapter — the only reason this file exists separately
// from components/TrackRow.tsx is react-window's rowComponent contract
// (one set of props shared across every row, plus an index/style per row,
// rather than a component instantiated per item with its own props). All
// actual row content/behavior lives in the shared component; this just
// unwraps tracks[index] and hands it off, stretched to fill react-window's
// fixed-height row slot (style.height) so the shared component's border
// lands exactly at the slot's bottom edge instead of floating above it.
export function TrackRow({
  index, style, tracks, playlistId, playableTracks, nowPlaying, isAudioPlaying, onTogglePlay, onDeleted, onUpdated,
}: RowComponentProps<TrackRowProps>) {
  const v = tracks[index];
  const trackPlaylistId = v.playlistId ?? playlistId ?? '';
  const isCurrentTrack = nowPlaying?.playlistId === trackPlaylistId && nowPlaying?.videoId === v.id;

  return (
    <Box style={style}>
      <TrackRowContent
        video={v}
        playlistId={playlistId}
        isCurrentTrack={isCurrentTrack}
        isAudioPlaying={isAudioPlaying}
        onTogglePlay={() => onTogglePlay(trackPlaylistId, v, playableTracks)}
        onDeleted={onDeleted}
        onUpdated={onUpdated}
        sx={{ height: '100%' }}
      />
    </Box>
  );
}
