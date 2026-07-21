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
    filteredTracks, playableTracks,
  } = usePlaylistDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();
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

    const index = filteredTracks.findIndex(v => v.id === nowPlaying.videoId);
    if (index < 0) {
      // Likely just hidden by an active genre filter — clear it and let this
      // effect re-run once filteredTracks reflects the full list again. If
      // the track genuinely isn't in the playlist, selectedGenres is empty
      // on the next pass and this becomes a harmless no-op.
      if (selectedGenres.size > 0) clearGenres();
      return;
    }

    listRef.current?.scrollToRow({ index, align: 'center', behavior: 'smooth' });
    scrolledForKeyRef.current = location.key;
  }, [location, nowPlaying, filteredTracks, playlistId, listRef, selectedGenres, clearGenres]);

  if (!playlistId) return <Navigate to="/playlists" replace />;

  if (playlist === 'loading' || videos === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (playlist === 'error' || videos === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('playlists.detail.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        playlist={playlist}
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={toggleGenre}
        onClearGenres={clearGenres}
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
          listRef={listRef}
        />
      </Box>
    </Box>
  );
}
