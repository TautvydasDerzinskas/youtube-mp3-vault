import { Box } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import { SIDEBAR_WIDTH, MOBILE_TOPBAR_HEIGHT } from './constants';
import { MiniPlayer } from './MiniPlayer';
import { PlayerProvider, usePlayer } from '../../contexts/PlayerContext';
import { useIsMobile } from '../../hooks/useIsMobile';

function AppLayoutContent() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const {
    nowPlaying, nowPlayingVideo, audioRef, hasNext, hasPrevious,
    setIsAudioPlaying, handleTrackEnded, playNext, playPrevious, handleClosePlayer,
  } = usePlayer();

  // Acts like the playlist's own "back" button, but also tells
  // PlaylistDetailPage to scroll the now-playing track into view once it
  // loads — see that page's scrollToNowPlaying handling.
  const handleTitleClick = nowPlaying
    ? () => navigate(`/playlists/${nowPlaying.playlistId}`, { state: { scrollToNowPlaying: true } })
    : undefined;

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {isMobile ? <MobileTopBar /> : <Sidebar width={SIDEBAR_WIDTH} />}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          backgroundColor: 'background.default',
          pb: nowPlaying ? 7 : 0,
          mt: isMobile ? `${MOBILE_TOPBAR_HEIGHT}px` : 0,
        }}
      >
        <Outlet />
      </Box>

      {/* Mini player — lives at the layout level (not a page) so playback survives route changes */}
      {nowPlaying && (
        <MiniPlayer
          title={nowPlayingVideo?.title}
          artist={nowPlayingVideo?.artist}
          thumbnailUrl={nowPlayingVideo?.thumbnailUrl}
          audioRef={audioRef}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onPlay={() => setIsAudioPlaying(true)}
          onPause={() => setIsAudioPlaying(false)}
          onEnded={handleTrackEnded}
          onNext={playNext}
          onPrevious={playPrevious}
          onClose={handleClosePlayer}
          onTitleClick={handleTitleClick}
        />
      )}
    </Box>
  );
}

export default function AppLayout() {
  return (
    <PlayerProvider>
      <AppLayoutContent />
    </PlayerProvider>
  );
}
