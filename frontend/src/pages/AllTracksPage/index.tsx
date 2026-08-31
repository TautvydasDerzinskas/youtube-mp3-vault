import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { ListImperativeAPI } from 'react-window';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAllTracksDetail } from './hooks/useAllTracksDetail';
import { Header } from './Header';
import { TrackList } from '../PlaylistDetailPage/TrackList';

export default function AllTracksPage() {
  const { t } = useTranslation();
  const {
    status, summary, genreCounts, selectedGenres, toggleGenre, clearGenres,
    sort, setSort, hqFilter, setHqFilter, favouriteFilter, setFavouriteFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks, removeVideo, updateVideo,
  } = useAllTracksDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay, skipSignal } = usePlayer();
  const location = useLocation();
  const listRef = useRef<ListImperativeAPI>(null);
  // Guards against re-scrolling on every render — only once per distinct
  // navigation (location.key changes on each new history entry, even to the
  // same path), matching the mini player's "act like back-to-origin" click,
  // which can fire repeatedly while already on this page. Mirrors
  // PlaylistDetailPage's identical handling.
  const scrolledForKeyRef = useRef<string | null>(null);
  // react-window's own container size starts at 0 and is only ever updated
  // asynchronously (via ResizeObserver, after this component's mount/layout
  // effects have already run) — calling scrollToRow before that first real
  // measurement lands computes its "center" offset against a 0-height
  // container, landing nowhere near the actual track (the bug this fixes:
  // scrolling silently failing on the very first click of the mini player's
  // title, only working on a second click once react-window had caught up).
  const [listMeasured, setListMeasured] = useState(false);
  const handleListResize = useCallback((size: { height: number }) => {
    if (size.height > 0) setListMeasured(true);
  }, []);
  // Second, independent trigger for the same scroll-to-now-playing effect
  // below — an explicit Next/Previous (mini player buttons or their
  // keyboard shortcuts) while already sitting on this page, which never
  // touches `location` at all. Initialized to the current skipSignal (not
  // 0) so mounting this page doesn't itself count as a pending skip just
  // because some Next/Previous clicks happened earlier, elsewhere.
  const respondedSkipRef = useRef(skipSignal);

  useEffect(() => {
    const locationTriggered = Boolean(location.state?.scrollToNowPlaying) && scrolledForKeyRef.current !== location.key;
    const skipTriggered = skipSignal !== respondedSkipRef.current;
    if (!locationTriggered && !skipTriggered) return;
    if (!nowPlaying) return;
    if (status === 'loading' || !listRef.current || !listMeasured) return;

    const index = filteredTracks.findIndex(v => v.id === nowPlaying.videoId);
    if (index < 0) {
      // Likely just hidden by an active genre/HQ/search filter — clear them
      // and let this effect re-run once filteredTracks reflects the full
      // list again.
      if (selectedGenres.size > 0) clearGenres();
      if (hqFilter !== 'all') setHqFilter('all');
      if (favouriteFilter !== 'all') setFavouriteFilter('all');
      if (searchQuery) setSearchQuery('');
      return;
    }

    listRef.current.scrollToRow({ index, align: 'center', behavior: 'smooth' });
    if (locationTriggered) scrolledForKeyRef.current = location.key;
    if (skipTriggered) respondedSkipRef.current = skipSignal;
  }, [
    location, nowPlaying, filteredTracks, listRef, listMeasured, skipSignal,
    selectedGenres, clearGenres, hqFilter, setHqFilter, favouriteFilter, setFavouriteFilter, searchQuery, setSearchQuery, status,
  ]);

  if (status === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (status === 'error' || !summary) {
    return <Alert severity="error" sx={{ m: 3 }}>{t('playlists.detail.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        summary={summary}
        visibleCount={filteredTracks.length}
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={toggleGenre}
        onClearGenres={clearGenres}
        sort={sort}
        onSortChange={setSort}
        hqFilter={hqFilter}
        onHqFilterChange={setHqFilter}
        favouriteFilter={favouriteFilter}
        onFavouriteFilterChange={setFavouriteFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      {/* Takes whatever height Header didn't use — TrackList's own virtualized
          list is what actually scrolls, Header stays pinned above it. */}
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <TrackList
          tracks={filteredTracks}
          playableTracks={playableTracks}
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onTogglePlay={handleTogglePlay}
          onDeleted={removeVideo}
          onUpdated={updateVideo}
          listRef={listRef}
          onResize={handleListResize}
        />
      </Box>
    </Box>
  );
}
