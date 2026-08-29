import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ListImperativeAPI } from 'react-window';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { useToast } from '../../contexts/ToastContext';
import { Playlist, playlistsApi } from '../../api/youtube';
import { RenameDialog } from '../PlaylistsPage/RenameDialog';
import { ScanHqDialog } from '../PlaylistsPage/ScanHqDialog';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';
import { displayName } from '../PlaylistsPage/utils';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { usePlaylistDetail } from './hooks/usePlaylistDetail';
import { Header } from './Header';
import { TrackList } from './TrackList';

export default function PlaylistDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showError } = useToast();
  const {
    playlistId, playlist, videos,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks, orderedPlayableTracks, firstPlayableTrack,
    removeVideo, updateVideo, updatePlaylist,
  } = usePlaylistDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay, stopIfPlaylist, isShuffle } = usePlayer();
  const online = useOnlineStatus();

  // "..." actions menu (Sync/Scan HQ/Rename/Retry Failed/Pause-Resume/
  // Delete) — same shared PlaylistActionsMenu the playlist list row uses.
  // Kept here (rather than in Header) since Header already follows the
  // established pattern of owning presentation only, with index.tsx as the
  // single owner of every mutation for this page (mirrors PlaylistsPage's
  // own index.tsx/PlaylistRow split).
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Covers Sync/Retry Failed while their own request is in flight — this
  // page's top-level redirect (below) already sends a *genuinely* busy
  // playlist to the syncing route on load, so isBusy/isPausing/isRetrying
  // are otherwise always false by the time this renders.
  const [submitting, setSubmitting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [scanningHq, setScanningHq] = useState(false);
  const [scanHqLoading, setScanHqLoading] = useState(false);

  // Sync and Scan HQ both kick off a live, still-mutating run — jump straight
  // to the dedicated syncing view (same one this page's own top-level guard
  // below redirects to) rather than leaving the user on a detail page whose
  // sort/filter/search controls don't make sense against a list still being
  // written to.
  const handleSync = async (_e: React.MouseEvent, id: string) => {
    setSubmitting(true);
    try {
      await playlistsApi.sync(id);
      navigate(`/playlists/${id}/syncing`);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.syncError'));
      setSubmitting(false);
    }
  };

  const handleConfirmScanHq = async (matchDuration: boolean) => {
    setScanHqLoading(true);
    try {
      await playlistsApi.scanHq(playlistId, { ignoreDuration: !matchDuration });
      setScanningHq(false);
      navigate(`/playlists/${playlistId}/syncing`);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.scanHqError'));
    } finally {
      setScanHqLoading(false);
    }
  };

  const handleRetryFailed = async (_e: React.MouseEvent, id: string) => {
    setSubmitting(true);
    try {
      const { playlist: updated } = await playlistsApi.retryFailed(id);
      updatePlaylist(updated);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.retryError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePause = async (_e: React.MouseEvent, target: Playlist) => {
    try {
      const { playlist: updated } = target.syncPaused
        ? await playlistsApi.resume(target.id)
        : await playlistsApi.pause(target.id);
      updatePlaylist(updated);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.togglePauseError'));
    }
  };

  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    try {
      await playlistsApi.remove(playlistId);
      stopIfPlaylist(playlistId);
      navigate('/playlists');
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.deleteError'));
      setDeleteLoading(false);
    }
  };
  const isPlaylistPlaying = nowPlaying?.playlistId === playlistId && isAudioPlaying;
  const handlePlayFirst = () => {
    if (orderedPlayableTracks.length === 0) return;
    // Already playing this playlist — the header button acts as pause/resume
    // on the current track rather than jumping to a new (possibly random)
    // one.
    if (nowPlaying?.playlistId === playlistId) {
      const current = orderedPlayableTracks.find(t => t.id === nowPlaying.videoId) ?? firstPlayableTrack;
      if (current) handleTogglePlay(playlistId, current, orderedPlayableTracks);
      return;
    }
    const startTrack = isShuffle
      ? orderedPlayableTracks[Math.floor(Math.random() * orderedPlayableTracks.length)]
      : firstPlayableTrack;
    if (startTrack) handleTogglePlay(playlistId, startTrack, orderedPlayableTracks);
  };
  const location = useLocation();
  const listRef = useRef<ListImperativeAPI>(null);
  // Guards against re-scrolling on every render — only once per distinct
  // navigation (location.key changes on each new history entry, even to the
  // same path), matching the mini player's "act like back-to-playlist"
  // click, which can fire repeatedly while already on this page.
  const scrolledForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!location.state?.scrollToNowPlaying) return;
    if (scrolledForKeyRef.current === location.key) return;
    if (!nowPlaying || nowPlaying.playlistId !== playlistId) return;
    // playlist and videos come from two independent requests that can
    // resolve in different renders — TrackList (and listRef) only mounts
    // once both are ready. Bail without marking this attempt "done" until
    // then, otherwise a scroll landing in the gap between the two silently
    // no-ops (listRef.current is still null) and never gets retried, since
    // neither of these is otherwise a dependency of this effect.
    if (playlist === 'loading' || videos === 'loading' || !listRef.current) return;

    const index = filteredTracks.findIndex(v => v.id === nowPlaying.videoId);
    if (index < 0) {
      // Likely just hidden by an active genre/HQ/search filter — clear them
      // and let this effect re-run once filteredTracks reflects the full
      // list again. If the track genuinely isn't in the playlist, every
      // filter is already at its default on the next pass and this becomes
      // a harmless no-op.
      if (selectedGenres.size > 0) clearGenres();
      if (hqFilter !== 'all') setHqFilter('all');
      if (searchQuery) setSearchQuery('');
      return;
    }

    listRef.current.scrollToRow({ index, align: 'center', behavior: 'smooth' });
    scrolledForKeyRef.current = location.key;
  }, [
    location, nowPlaying, filteredTracks, playlistId, listRef,
    selectedGenres, clearGenres, hqFilter, setHqFilter, searchQuery, setSearchQuery, playlist, videos,
  ]);

  if (!playlistId) return <Navigate to="/playlists" replace />;

  if (playlist === 'loading' || videos === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (playlist === 'error' || videos === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('playlists.detail.failedToLoad')}</Alert>;
  }

  // A playlist that's actually busy (direct link, bookmark, refresh, or a
  // sync starting elsewhere while this URL happened to already be loaded)
  // belongs on the dedicated syncing view instead — this page's sort/filter/
  // search controls don't make sense against a list still being mutated out
  // from under them. Only checked once at load, not on every poll tick —
  // this page doesn't poll at all, so a sync starting *while already sitting
  // here* isn't caught until the next navigation/reload.
  if (playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || playlist.syncStatus === 'retrying') {
    return <Navigate to={`/playlists/${playlistId}/syncing`} replace />;
  }

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        playlist={playlist}
        visibleCount={filteredTracks.length}
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={toggleGenre}
        onClearGenres={clearGenres}
        sort={sort}
        onSortChange={setSort}
        hqFilter={hqFilter}
        onHqFilterChange={setHqFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onPlayFirst={handlePlayFirst}
        canPlayFirst={firstPlayableTrack !== null}
        isPlaying={isPlaylistPlaying}
        isBusy={submitting}
        // This page's own top-level guard above already redirects a
        // genuinely busy or mid-pause playlist to the syncing route on load
        // — by the time the header renders, neither ever applies here.
        isPausing={false}
        isRetrying={false}
        online={online}
        menuPos={menuPos}
        onMenuPosChange={setMenuPos}
        onRename={() => setRenaming(true)}
        onSync={handleSync}
        onRetryFailed={handleRetryFailed}
        onScanHq={() => setScanningHq(true)}
        onTogglePause={handleTogglePause}
        onDelete={() => setDeleting(true)}
      />
      {/* Takes whatever height Header didn't use — TrackList's own virtualized
          list is what actually scrolls, Header stays pinned above it. */}
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <TrackList
          tracks={filteredTracks}
          playableTracks={playableTracks}
          playlistId={playlistId}
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onTogglePlay={handleTogglePlay}
          onDeleted={removeVideo}
          onUpdated={updateVideo}
          listRef={listRef}
        />
      </Box>

      {renaming && (
        <RenameDialog playlist={playlist} onClose={() => setRenaming(false)}
          onRenamed={updated => { updatePlaylist(updated); setRenaming(false); }} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('playlists.deleteConfirm.title')}
          message={t('playlists.deleteConfirm.message', { name: displayName(playlist) })}
          confirmLabel={t('playlists.remove')}
          destructive
          loading={deleteLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(false)}
        />
      )}
      {scanningHq && (
        <ScanHqDialog
          loading={scanHqLoading}
          onConfirm={handleConfirmScanHq}
          onCancel={() => setScanningHq(false)}
        />
      )}
    </Box>
  );
}
