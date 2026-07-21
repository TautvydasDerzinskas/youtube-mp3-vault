import { Box } from '@mui/material';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import { SIDEBAR_WIDTH, MOBILE_TOPBAR_HEIGHT } from './constants';
import { MiniPlayer } from './MiniPlayer';
import { PlayerProvider, usePlayer } from '../../contexts/PlayerContext';
import { useIsMobile } from '../../hooks/useIsMobile';

function AppLayoutContent() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    nowPlaying, nowPlayingVideo, audioRef, hasNext, hasPrevious, isRepeat, isShuffle,
    setIsAudioPlaying, handleTrackEnded, playNext, playPrevious, toggleRepeat, toggleShuffle, handleClosePlayer,
  } = usePlayer();

  // Goes back to wherever playback was actually started from (a specific
  // playlist, or "All Tracks") — not necessarily the track's own owning
  // playlist, which is all nowPlaying.playlistId would tell you. Also tells
  // that page to scroll the now-playing track into view once it loads
  // (clearing any active genre filter that's hiding it first) — see
  // PlaylistDetailPage/AllTracksPage's scrollToNowPlaying handling. When
  // already on that page, this replaces the history entry instead of
  // pushing a new one, so it doesn't leave a dead "back" stop — the page
  // still picks up the fresh state and scrolls, since location.key changes
  // either way.
  const handleTitleClick = () => {
    if (!nowPlaying) return;
    const targetPath = nowPlaying.originPath;
    navigate(targetPath, {
      state: { scrollToNowPlaying: true },
      replace: location.pathname === targetPath,
    });
  };

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
          isRepeat={isRepeat}
          isShuffle={isShuffle}
          onPlay={() => setIsAudioPlaying(true)}
          onPause={() => setIsAudioPlaying(false)}
          onEnded={handleTrackEnded}
          onNext={playNext}
          onPrevious={playPrevious}
          onToggleRepeat={toggleRepeat}
          onToggleShuffle={toggleShuffle}
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
