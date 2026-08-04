import client from './client';

// Best-effort signals, not user-facing requests — call sites always swallow
// rejections (see PlayerContext.tsx), same as playlistsApi.markPlayed.
export const nowPlayingApi = {
  set: async (playlistId: string, videoId: string): Promise<void> => {
    await client.post('/now-playing', { playlistId, videoId });
  },
  clear: async (): Promise<void> => {
    await client.post('/now-playing/clear');
  },
};
