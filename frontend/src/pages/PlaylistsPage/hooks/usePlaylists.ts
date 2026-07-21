import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playlistsApi, Playlist } from '../../../api/youtube';
import { VideoState } from '../types';

export function usePlaylists() {
  const { t } = useTranslation();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | false>(false);
  const [videoCache, setVideoCache] = useState<Record<string, VideoState>>({});
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  // Subset of `syncing` specifically for retry-failed requests still in
  // flight — lets the UI know not to offer pause during the brief window
  // before the backend's 'retrying' syncStatus comes back (see PlaylistRow).
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandedRef = useRef<string | false>(false);

  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  const loadPlaylists = useCallback(async () => {
    try {
      const { playlists } = await playlistsApi.getAll();
      setPlaylists(playlists);
      return playlists;
    } catch {
      setError(t('playlists.failedToLoad'));
      return [];
    }
  }, [t]);

  // Poll while any playlist is syncing
  const schedulePoll = useCallback((list: Playlist[]) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const hasSyncing = list.some(p => p.syncStatus === 'syncing' || p.syncStatus === 'retrying' || p.syncStatus === 'generating');
    if (!hasSyncing) return;
    pollRef.current = setTimeout(async () => {
      const fresh = await loadPlaylists();
      const currentExpanded = expandedRef.current;
      if (currentExpanded) {
        playlistsApi.getVideos(currentExpanded)
          .then(({ videos }) => setVideoCache(prev => ({ ...prev, [currentExpanded]: videos })))
          .catch(() => {});
      }
      schedulePoll(fresh);
    }, 3000);
  }, [loadPlaylists]);

  useEffect(() => {
    loadPlaylists().then(list => {
      setLoading(false);
      schedulePoll(list);
    });
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [loadPlaylists, schedulePoll]);

  const updatePlaylist = (updated: Playlist) => {
    setPlaylists(prev => prev.map(p => p.id === updated.id ? updated : p));
    schedulePoll([updated]);
  };

  const handleAdded = (playlist: Playlist) => {
    setPlaylists(prev => [playlist, ...prev]);
    schedulePoll([playlist]);
  };

  const handleSync = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSyncing(prev => new Set(prev).add(id));
    try {
      const { playlist } = await playlistsApi.sync(id);
      updatePlaylist(playlist);
    } finally {
      setSyncing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleRetryFailed = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSyncing(prev => new Set(prev).add(id));
    setRetrying(prev => new Set(prev).add(id));
    try {
      const { playlist } = await playlistsApi.retryFailed(id);
      updatePlaylist(playlist);
    } finally {
      setSyncing(prev => { const s = new Set(prev); s.delete(id); return s; });
      setRetrying(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleTogglePause = async (e: React.MouseEvent, playlist: Playlist) => {
    e.stopPropagation();
    const { playlist: updated } = playlist.syncPaused
      ? await playlistsApi.resume(playlist.id)
      : await playlistsApi.pause(playlist.id);
    updatePlaylist(updated);
  };

  const handleDelete = async (playlist: Playlist) => {
    await playlistsApi.remove(playlist.id);
    setPlaylists(prev => prev.filter(p => p.id !== playlist.id));
    if (expanded === playlist.id) setExpanded(false);
  };

  // Throws on failure (e.g. one's already been generated for this source) —
  // the caller shows the error, since unlike the actions above this creates
  // a whole new playlist rather than updating an existing one.
  const handleGenerateSimilar = async (id: string): Promise<void> => {
    const { playlist } = await playlistsApi.generateSimilar(id);
    handleAdded(playlist);
  };

  return {
    playlists, loading, error, syncing, retrying,
    videoCache, setVideoCache,
    expanded, setExpanded,
    updatePlaylist, handleAdded, handleSync, handleRetryFailed, handleTogglePause, handleDelete,
    handleGenerateSimilar,
  };
}
