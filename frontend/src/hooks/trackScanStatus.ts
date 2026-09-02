import { useCallback, useSyncExternalStore } from 'react';
import { CloseHqCandidate, PlaylistVideo } from '../api/youtube';

// Module-level, outside React state, so a track's scan/rename lifecycle
// survives its row unmounting — react-window (PlaylistDetailPage/TrackList.tsx)
// really does unmount rows once they scroll outside its render range, which
// used to silently drop useTrackActions' local `searching` flag (and its
// progress bar) and its `closeCandidates` result (and the rename-suggestion
// dialog it drives) along with it. Every caller of useTrackActions (the
// playlist page, All Tracks, History, TrackDetailPage's header) shares this
// one store, so a track's status is consistent no matter which of them
// rendered the row that started it.
interface TrackScanState {
  scanning: boolean;
  closeCandidates: CloseHqCandidate[];
}

export type CandidateTrackSnapshot = Pick<PlaylistVideo, 'id' | 'youtubeId' | 'originalTitle' | 'title' | 'artist' | 'duration'>;

export interface PendingHqCandidates {
  playlistId: string;
  video: CandidateTrackSnapshot;
  candidates: CloseHqCandidate[];
  // Whether this track already had an HQ file/upgrade before the search
  // that produced these candidates — always false in practice (a track
  // already carrying one wouldn't reach this branch), but carried through
  // rather than assumed, so a candidate-triggered rename reports "found HQ"
  // with the same correctness as picking the same rename from the row
  // itself would.
  hadHq: boolean;
}

const EMPTY_CANDIDATES: CloseHqCandidate[] = [];
const DEFAULT_STATE: TrackScanState = { scanning: false, closeCandidates: EMPTY_CANDIDATES };

const state = new Map<string, TrackScanState>();
const listeners = new Map<string, Set<() => void>>();

// Separate from `state`/its per-video `listeners` above — this is what backs
// the always-mounted close-candidates modal (see PendingHqCandidatesModal,
// mounted once in AppLayout.tsx), which needs to enumerate every track with
// a pending result across the whole app, not just one videoId, and needs a
// playlistId + video snapshot `state` alone doesn't carry. Kept as its own
// Map with a cached array snapshot (rebuilt only on mutation) rather than
// deriving one from `state` on every read, since useSyncExternalStore
// requires a stable snapshot reference between renders when nothing changed.
const pending = new Map<string, PendingHqCandidates>();
const pendingListeners = new Set<() => void>();
let pendingSnapshot: PendingHqCandidates[] = [];

function notifyPending() {
  pendingSnapshot = Array.from(pending.values());
  pendingListeners.forEach(listener => listener());
}

function getState(videoId: string): TrackScanState {
  return state.get(videoId) ?? DEFAULT_STATE;
}

function notify(videoId: string) {
  listeners.get(videoId)?.forEach(listener => listener());
}

// Drops the map entry entirely once there's nothing left worth remembering
// for this id (not scanning, no pending candidates) — otherwise this map
// would grow for every track ever scanned over a long session.
function setState(videoId: string, next: TrackScanState) {
  if (!next.scanning && next.closeCandidates.length === 0) {
    state.delete(videoId);
  } else {
    state.set(videoId, next);
  }
  notify(videoId);
}

export function setTrackScanning(videoId: string, isScanning: boolean) {
  const current = getState(videoId);
  if (current.scanning === isScanning) return;
  setState(videoId, { ...current, scanning: isScanning });
}

// `meta` is required when setting a non-empty `closeCandidates` (the lifted
// modal needs a playlistId + video snapshot to render/act on it later,
// possibly long after the row that triggered the search is gone) and
// ignored when clearing back to `[]` (dismissed, selected, or a fresh
// search started).
export function setTrackCloseCandidates(
  videoId: string,
  closeCandidates: CloseHqCandidate[],
  meta?: { playlistId: string; video: CandidateTrackSnapshot; hadHq: boolean },
) {
  setState(videoId, { ...getState(videoId), closeCandidates });
  if (closeCandidates.length > 0 && meta) {
    pending.set(videoId, { playlistId: meta.playlistId, video: meta.video, candidates: closeCandidates, hadHq: meta.hadHq });
  } else {
    pending.delete(videoId);
  }
  notifyPending();
}

function useTrackScanState(videoId: string): TrackScanState {
  const subscribe = useCallback((onStoreChange: () => void) => {
    let set = listeners.get(videoId);
    if (!set) {
      set = new Set();
      listeners.set(videoId, set);
    }
    set.add(onStoreChange);
    return () => {
      set!.delete(onStoreChange);
      if (set!.size === 0) listeners.delete(videoId);
    };
  }, [videoId]);

  const getSnapshot = useCallback(() => getState(videoId), [videoId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useTrackScanningStatus(videoId: string): boolean {
  return useTrackScanState(videoId).scanning;
}

// Every track across the whole app currently sitting on an unresolved
// "close but not confident" HQ match — oldest first. Backs the
// always-mounted PendingHqCandidatesModal so a result surfaces regardless of
// which page/row/scroll position triggered the search that produced it, and
// so multiple concurrent searches each get their own entry (queued, shown
// one dialog at a time) instead of clobbering one another.
export function usePendingHqCandidates(): PendingHqCandidates[] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    pendingListeners.add(onStoreChange);
    return () => { pendingListeners.delete(onStoreChange); };
  }, []);
  const getSnapshot = useCallback(() => pendingSnapshot, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}
