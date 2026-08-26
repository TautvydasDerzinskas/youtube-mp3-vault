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
    // react-window gives every row its own absolutely-positioned sibling
    // (style.position), each stacking in plain DOM order since none carries
    // its own z-index — so the inner row's own hover z-index bump (which
    // only promotes it within *this* wrapper, its sole child) never affects
    // how this wrapper compares to the *other* rows' wrappers, and a later
    // (lower) row still paints over a hovered one above it. :hover on this
    // wrapper fires from the same pointer-over-a-descendant bubbling as the
    // inner row's own :hover, so this promotes the row that actually
    // competes for stacking order.
    <Box style={style} sx={{ '&:hover': { zIndex: 1 } }}>
      <TrackRowContent
        // react-window keys its own row wrapper by index, not by item
        // identity (no itemKey/rowKey prop exists in its v2 List API to
        // override this — confirmed directly in its source, which renders
        // each visible row with `key: <loop index>`). When a search/genre
        // filter reorders `tracks`, the row at a given index can silently
        // start showing a different track while this component instance
        // (and all its state — an open rename dialog, an in-flight search,
        // ...) gets reused as-is, since React only remounts on a key
        // change. That let a rename submitted right after such a reorder
        // target whatever track now occupied the slot instead of the one
        // the dialog was actually opened for. Keying by the track's own id
        // forces a full remount (fresh state) the moment the slot's
        // occupant actually changes, rather than recycling stale state
        // across two unrelated tracks.
        key={v.id}
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
