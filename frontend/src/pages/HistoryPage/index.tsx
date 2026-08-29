import { useRef } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { ListImperativeAPI } from 'react-window';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../../contexts/PlayerContext';
import { useHistoryDetail } from './hooks/useHistoryDetail';
import { Header } from './Header';
import { TrackList } from '../PlaylistDetailPage/TrackList';

// Mirrors AllTracksPage — same virtualized TrackList over a client-fetched
// list, just backed by GET /history instead of /all-tracks. No
// scroll-to-now-playing handling here (unlike AllTracksPage): a track
// dropping out of history isn't a filter side-effect to recover from, it's
// simply not in the capped 100 — nothing to scroll back to.
export default function HistoryPage() {
  const { t } = useTranslation();
  const {
    status, summary, searchQuery, setSearchQuery,
    filteredTracks, playableTracks, removeVideo, updateVideo,
  } = useHistoryDetail();
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
        visibleCount={filteredTracks.length}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
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
