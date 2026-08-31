import { useCallback, useSyncExternalStore } from 'react';
import { CloseHqCandidate } from '../api/youtube';

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

const EMPTY_CANDIDATES: CloseHqCandidate[] = [];
const DEFAULT_STATE: TrackScanState = { scanning: false, closeCandidates: EMPTY_CANDIDATES };

const state = new Map<string, TrackScanState>();
const listeners = new Map<string, Set<() => void>>();

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

export function setTrackCloseCandidates(videoId: string, closeCandidates: CloseHqCandidate[]) {
  setState(videoId, { ...getState(videoId), closeCandidates });
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

export function useTrackCloseCandidates(videoId: string): CloseHqCandidate[] {
  return useTrackScanState(videoId).closeCandidates;
}
