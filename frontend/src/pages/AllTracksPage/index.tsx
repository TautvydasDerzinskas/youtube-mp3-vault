import { useEffect, useRef } from 'react';
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
    sort, setSort, hqFilter, setHqFilter, searchQuery, setSearchQuery,
    filteredTracks, playableTracks, removeVideo, updateVideo,
  } = useAllTracksDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();
  const location = useLocation();
  const listRef = useRef<ListImperativeAPI>(null);
  // Guards against re-scrolling on every render — only once per distinct
  // navigation (location.key changes on each new history entry, even to the
  // same path), matching the mini player's "act like back-to-origin" click,
  // which can fire repeatedly while already on this page. Mirrors
  // PlaylistDetailPage's identical handling.
  const scrolledForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!location.state?.scrollToNowPlaying) return;
    if (scrolledForKeyRef.current === location.key) return;
    if (!nowPlaying) return;
    if (status === 'loading' || !listRef.current) return;

    const index = filteredTracks.findIndex(v => v.id === nowPlaying.videoId);
    if (index < 0) {
      // Likely just hidden by an active genre/HQ/search filter — clear them
      // and let this effect re-run once filteredTracks reflects the full
      // list again.
      if (selectedGenres.size > 0) clearGenres();
      if (hqFilter !== 'all') setHqFilter('all');
      if (searchQuery) setSearchQuery('');
      return;
    }

    listRef.current.scrollToRow({ index, align: 'center', behavior: 'smooth' });
    scrolledForKeyRef.current = location.key;
  }, [
    location, nowPlaying, filteredTracks, listRef,
    selectedGenres, clearGenres, hqFilter, setHqFilter, searchQuery, setSearchQuery, status,
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
        />
      </Box>
    </Box>
  );
}
