import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import { SIDEBAR_WIDTH, MOBILE_TOPBAR_HEIGHT } from './constants';
import { MiniPlayer } from './MiniPlayer';
import { PlayerProvider, usePlayer } from '../../contexts/PlayerContext';
import { useIsMobile } from '../../hooks/useIsMobile';

function AppLayoutContent() {
  const isMobile = useIsMobile();
  const {
    nowPlaying, nowPlayingVideo, audioRef, hasNext, hasPrevious,
    setIsAudioPlaying, handleTrackEnded, playNext, playPrevious, handleClosePlayer,
  } = usePlayer();

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
