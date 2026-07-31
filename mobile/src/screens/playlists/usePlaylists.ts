import { useCallback, useEffect, useRef, useState } from 'react';
import { playlistsApi, Playlist } from '../../api/playlists';

// Mirrors frontend/src/pages/PlaylistsPage/hooks/usePlaylists.ts's data
// fetching/polling/mutation core — the video-cache/expanded-accordion state
// isn't ported since mobile rows never expand inline (see PlaylistsScreen;
// tapping a row always pushes PlaylistDetailScreen instead).
export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlaylists = useCallback(async (): Promise<Playlist[]> => {
    const { playlists: list } = await playlistsApi.getAll();
    setPlaylists(list);
    return list;
  }, []);

  // Recursive setTimeout (not setInterval) — only reschedules itself while
  // something in the freshly-fetched list is still syncing/retrying/
  // generating, so polling naturally stops once everything settles.
  const schedulePoll = useCallback((list: Playlist[]) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const hasActive = list.some(p => p.syncStatus === 'syncing' || p.syncStatus === 'retrying' || p.syncStatus === 'generating');
    if (!hasActive) return;
    pollRef.current = setTimeout(async () => {
      try {
        const fresh = await loadPlaylists();
        schedulePoll(fresh);
      } catch {
        // Network hiccup — stop polling silently rather than looping on errors forever.
      }
    }, 3000);
  }, [loadPlaylists]);

  useEffect(() => {
    (async () => {
      try {
        const list = await loadPlaylists();
        schedulePoll(list);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePlaylist = useCallback((updated: Playlist) => {
    setPlaylists(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    schedulePoll([updated]);
  }, [schedulePoll]);

  const handleAdded = useCallback((playlist: Playlist) => {
    setPlaylists(prev => [playlist, ...prev]);
    schedulePoll([playlist]);
  }, [schedulePoll]);

  const handleSync = useCallback(async (id: string) => {
    const { playlist } = await playlistsApi.sync(id);
    updatePlaylist(playlist);
  }, [updatePlaylist]);

  const handleRetryFailed = useCallback(async (id: string) => {
    const { playlist } = await playlistsApi.retryFailed(id);
    updatePlaylist(playlist);
  }, [updatePlaylist]);

  const handleScanHq = useCallback(async (id: string) => {
    const { playlist } = await playlistsApi.scanHq(id);
    updatePlaylist(playlist);
  }, [updatePlaylist]);

  const handleTogglePause = useCallback(async (playlist: Playlist) => {
    const { playlist: updated } = playlist.syncPaused
      ? await playlistsApi.resume(playlist.id)
      : await playlistsApi.pause(playlist.id);
    updatePlaylist(updated);
  }, [updatePlaylist]);

  const handleRename = useCallback(async (id: string, customName: string | null) => {
    const { playlist } = await playlistsApi.rename(id, customName);
    updatePlaylist(playlist);
  }, [updatePlaylist]);

  const handleDelete = useCallback(async (playlist: Playlist) => {
    await playlistsApi.remove(playlist.id);
    setPlaylists(prev => prev.filter(p => p.id !== playlist.id));
  }, []);

  const handleGenerateSimilar = useCallback(async (id: string) => {
    const { playlist } = await playlistsApi.generateSimilar(id);
    handleAdded(playlist);
    return playlist;
  }, [handleAdded]);

  return {
    playlists, loading, error,
    updatePlaylist, handleAdded,
    handleSync, handleRetryFailed, handleScanHq, handleTogglePause, handleRename, handleDelete, handleGenerateSimilar,
  };
}
