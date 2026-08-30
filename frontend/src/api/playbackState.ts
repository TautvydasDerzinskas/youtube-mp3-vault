import client from './client';

export interface PersistedQueueEntry {
  playlistId: string;
  videoId: string;
}

export interface PlaybackStateDTO {
  playlistId: string;
  videoId: string;
  positionSeconds: number;
  isShuffle: boolean;
  isRepeat: boolean;
  originPath: string;
  queue: PersistedQueueEntry[];
  history: PersistedQueueEntry[];
}

// What a save actually needs to send varies by call site (see
// PlayerContext.tsx) — queue/history are only included when they've
// changed, so lightweight heartbeat/track-advance writes don't resend a
// potentially large queue; the backend leaves the stored value untouched
// when they're omitted.
export type SavePlaybackStatePayload = Omit<PlaybackStateDTO, 'queue' | 'history'> & {
  queue?: PersistedQueueEntry[];
  history?: PersistedQueueEntry[];
};

export const playbackStateApi = {
  save: async (state: SavePlaybackStatePayload): Promise<void> => {
    await client.post('/playback-state', state);
  },
  get: async (): Promise<PlaybackStateDTO | null> => {
    const { data } = await client.get<{ state: PlaybackStateDTO | null }>('/playback-state');
    return data.state;
  },
  clear: async (): Promise<void> => {
    await client.post('/playback-state/clear');
  },
};
