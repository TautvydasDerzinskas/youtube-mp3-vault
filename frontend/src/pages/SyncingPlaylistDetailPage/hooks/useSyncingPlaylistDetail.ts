import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { playlistsApi, Playlist, PlaylistVideo } from '../../../api/youtube';

function isBusy(playlist: Playlist): boolean {
  return playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || playlist.syncStatus === 'retrying';
}

// Mirrors PlaylistsPage/hooks/usePlaylists.ts's schedulePoll pattern (a
// self-rescheduling setTimeout that stops on its own once nothing's busy)
// but for one playlist's full detail (playlist + its videos) instead of the
// whole list — this page needs both to keep resolving syncPhase.processedIds
// against real track data as they arrive.
export function useSyncingPlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | 'loading' | 'error'>('loading');
  const [videos, setVideos] = useState<PlaylistVideo[] | 'loading' | 'error'>('loading');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!id) return null;
    try {
      const [{ playlist: freshPlaylist }, { videos: freshVideos }] = await Promise.all([
        playlistsApi.getOne(id),
        playlistsApi.getVideos(id),
      ]);
      setPlaylist(freshPlaylist);
      setVideos(freshVideos);
      return freshPlaylist;
    } catch {
      setPlaylist('error');
      setVideos('error');
      return null;
    }
  }, [id]);

  const schedulePoll = useCallback((current: Playlist | null) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (!current || !isBusy(current)) return;
    pollRef.current = setTimeout(async () => {
      const fresh = await load();
      schedulePoll(fresh);
    }, 3000);
  }, [load]);

  useEffect(() => {
    setPlaylist('loading');
    setVideos('loading');
    load().then(schedulePoll);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Once the sync/scan this page exists for is actually done, there's
  // nothing left for this view to show — hand off to the normal detail page.
  // `replace: true` so back doesn't return to a now-stale syncing view.
  useEffect(() => {
    if (playlist !== 'loading' && playlist !== 'error' && !isBusy(playlist)) {
      navigate(`/playlists/${id}`, { replace: true });
    }
  }, [playlist, id, navigate]);

  return { playlistId: id ?? '', playlist, videos };
}
