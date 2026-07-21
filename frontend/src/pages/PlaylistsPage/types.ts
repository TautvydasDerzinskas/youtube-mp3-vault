import { PlaylistVideo } from '../../api/youtube';

export type VideoState = PlaylistVideo[] | 'loading' | 'error';

export interface NowPlaying {
  playlistId: string;
  videoId: string;
  // Route to return to when the mini player's title is clicked — the page
  // playback was actually started from (e.g. "/all-tracks"), which isn't
  // necessarily the track's own owning playlist's page. Captured once when
  // playback starts and carried forward unchanged across next/previous/
  // auto-advance, so it still points back to wherever you started even
  // after navigating elsewhere while listening.
  originPath: string;
}
