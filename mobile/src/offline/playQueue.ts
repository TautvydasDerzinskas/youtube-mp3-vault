import { playlistsApi } from '../api/playlists';
import { playQueueStorage } from './playQueueStorage';

// Matches the backend's MAX_PLAYS_PER_SYNC (backend/src/routes/youtube.ts) —
// a queue built up over days offline is chunked into requests of this size
// rather than sent as one arbitrarily large body.
const CHUNK_SIZE = 500;

// Every "track finished playing" event (see PlayerContext's
// handleTrackEndedRef) goes through this queue, online or offline — rather
// than a fire-and-forget network call that just silently fails when
// unreachable, it's persisted first and only removed once the backend has
// actually confirmed it. When online this is invisible (enqueue, flush
// immediately, gone); when offline it accumulates until the next flush
// attempt succeeds (see OfflineDownloadsContext's foreground/reconnect
// triggers, which call flushPlayQueue alongside their own sync).
export function enqueuePlay(playlistId: string, videoId: string, playedAt: number = Date.now()): void {
  playQueueStorage.append({ id: `${videoId}-${playedAt}`, playlistId, videoId, playedAt });
}

let flushing = false;

// Sends queued plays in FIFO chunks, removing each chunk from the persisted
// queue only after the server confirms it — so a mid-flush failure (network
// drop partway through a long backlog) just leaves the remainder queued for
// the next attempt instead of losing or double-counting anything.
export async function flushPlayQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = playQueueStorage.getAll();
    while (queue.length > 0) {
      const chunk = queue.slice(0, CHUNK_SIZE);
      try {
        await playlistsApi.syncPlays(chunk.map(({ playlistId, videoId, playedAt }) => ({ playlistId, videoId, playedAt })));
      } catch {
        return;
      }
      playQueueStorage.removeIds(new Set(chunk.map((c) => c.id)));
      queue = playQueueStorage.getAll();
    }
  } finally {
    flushing = false;
  }
}
