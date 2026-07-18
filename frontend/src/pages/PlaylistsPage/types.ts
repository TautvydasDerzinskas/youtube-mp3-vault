import { PlaylistVideo } from '../../api/youtube';

export type VideoState = PlaylistVideo[] | 'loading' | 'error';

export interface NowPlaying {
  playlistId: string;
  videoId: string;
}
