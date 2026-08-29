import { useEffect, useRef } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { ListImperativeAPI } from 'react-window';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { usePlaylistDetail } from './hooks/usePlaylistDetail';
import { Header } from './Header';
import { TrackList } from './TrackList';

export default function PlaylistDetailPage() {
  const { t } = useTranslation();
  const {
    playlistId, playlist, videos,
    genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks, orderedPlayableTracks, firstPlayableTrack,
    removeVideo, updateVideo,
  } = usePlaylistDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay, isShuffle } = usePlayer();
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
    </Box>
  );
}
