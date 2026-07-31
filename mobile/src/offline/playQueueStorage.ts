import { File, Paths } from 'expo-file-system';

// One queued "this track finished playing" event, waiting to be reported to
// the backend (see playQueue.ts). `id` is just `${videoId}-${playedAt}` —
// good enough to dedup/remove entries after a successful flush without
// needing a real UUID generator for what's an entirely local, low-stakes key.
export interface QueuedPlay {
  id: string;
  playlistId: string;
  videoId: string;
  playedAt: number;
}

// Same JSON-file-backed pattern as offline/offlineIndex.ts — a play queued
// while offline must survive an app kill, and this is the smallest amount of
// machinery that guarantees that (no AsyncStorage/SQLite dependency needed
// just for a small append-only list of play events).
const QUEUE_FILE = new File(Paths.document, 'play-queue.json');

let cache: QueuedPlay[] | null = null;

function readQueue(): QueuedPlay[] {
  if (cache) return cache;
  if (!QUEUE_FILE.exists) {
    cache = [];
    return cache;
  }
  try {
    cache = JSON.parse(QUEUE_FILE.textSync()) as QueuedPlay[];
  } catch {
    cache = [];
  }
  return cache;
}

function writeQueue(queue: QueuedPlay[]): void {
  cache = queue;
  QUEUE_FILE.write(JSON.stringify(queue));
}

export const playQueueStorage = {
  getAll(): QueuedPlay[] {
    return readQueue();
  },
  append(entry: QueuedPlay): void {
    writeQueue([...readQueue(), entry]);
  },
  removeIds(ids: Set<string>): void {
    writeQueue(readQueue().filter((q) => !ids.has(q.id)));
  },
};
