import { useCallback, useSyncExternalStore } from 'react';

// Module-level, outside React state, so a track's "searching" status survives
// its row unmounting — react-window (PlaylistDetailPage/TrackList.tsx) really
// does unmount rows once they scroll outside its render range, which used to
// silently drop useTrackActions' local `searching` state and its progress bar
// along with it. Every caller of useTrackActions (the playlist page, All
// Tracks, History, TrackDetailPage's header) shares this one store, so a
// track's scan/rename status is consistent no matter which of them rendered
// the row that started it.
const scanning = new Map<string, true>();
const listeners = new Map<string, Set<() => void>>();

export function setTrackScanning(videoId: string, isScanning: boolean) {
  if (isScanning) {
    scanning.set(videoId, true);
  } else {
    scanning.delete(videoId);
  }
  listeners.get(videoId)?.forEach(listener => listener());
}

export function useTrackScanningStatus(videoId: string): boolean {
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

  const getSnapshot = useCallback(() => scanning.has(videoId), [videoId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
