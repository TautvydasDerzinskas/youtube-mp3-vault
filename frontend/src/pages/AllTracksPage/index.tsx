import { useRef } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { ListImperativeAPI } from 'react-window';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAllTracksDetail } from './hooks/useAllTracksDetail';
import { Header } from './Header';
import { TrackList } from '../PlaylistDetailPage/TrackList';

export default function AllTracksPage() {
  const { t } = useTranslation();
  const {
    status, summary, genreCounts, selectedGenres, toggleGenre, clearGenres, filteredTracks, playableTracks,
  } = useAllTracksDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();
  const listRef = useRef<ListImperativeAPI>(null);

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
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onTogglePlay={handleTogglePlay}
          listRef={listRef}
        />
      </Box>
    </Box>
  );
}
