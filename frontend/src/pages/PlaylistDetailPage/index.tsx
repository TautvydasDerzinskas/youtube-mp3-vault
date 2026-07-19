import { Box, CircularProgress, Alert } from '@mui/material';
import { Navigate } from 'react-router-dom';
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
        />
      </Box>
    </Box>
  );
}
