import client from './client';

// Best-effort signals, not user-facing requests — call sites always swallow
// rejections and suppress the error toast, same as the offline play queue
// (see offline/playQueue.ts).
export const nowPlayingApi = {
  set: async (playlistId: string, videoId: string): Promise<void> => {
    await client.post('/now-playing', { playlistId, videoId }, { suppressErrorToast: true });
  },
  clear: async (): Promise<void> => {
    await client.post('/now-playing/clear', undefined, { suppressErrorToast: true });
  },
};
