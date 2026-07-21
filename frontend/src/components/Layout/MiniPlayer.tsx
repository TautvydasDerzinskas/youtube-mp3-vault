import { Box, Typography, IconButton, Tooltip, Avatar } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Close as CloseIcon,
  SkipPrevious as SkipPreviousIcon, SkipNext as SkipNextIcon,
  Repeat as RepeatIcon, Shuffle as ShuffleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { SIDEBAR_WIDTH } from './constants';
import { useIsMobile } from '../../hooks/useIsMobile';

interface MiniPlayerProps {
  title: string | undefined;
  artist: string | null | undefined;
  thumbnailUrl: string | null | undefined;
  audioRef: React.RefObject<HTMLAudioElement>;
  hasNext: boolean;
  hasPrevious: boolean;
  isRepeat: boolean;
  isShuffle: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onClose: () => void;
  // Always defined whenever MiniPlayer itself is rendered — it's only ever
  // mounted (see AppLayout) once nowPlaying/nowPlayingVideo are set, and
  // those two always carry a playlistId together.
  onTitleClick: () => void;
}

export function MiniPlayer({
  title, artist, thumbnailUrl, audioRef, hasNext, hasPrevious, isRepeat, isShuffle,
  onPlay, onPause, onEnded, onNext, onPrevious, onToggleRepeat, onToggleShuffle, onClose, onTitleClick,
}: MiniPlayerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const thumbnail = (
    <Avatar src={thumbnailUrl ?? undefined} variant="rounded"
      sx={{ width: isMobile ? 48 : 40, height: isMobile ? 48 : 40, borderRadius: 1, flexShrink: 0 }}>
      <MusicNoteIcon />
    </Avatar>
  );
  const previousButton = hasPrevious && (
    <Tooltip title={t('playlists.miniPlayer.previous')}>
      <IconButton size="small" onClick={onPrevious} sx={{ flexShrink: 0 }}>
        <SkipPreviousIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const nextButton = hasNext && (
    <Tooltip title={t('playlists.miniPlayer.next')}>
      <IconButton size="small" onClick={onNext} sx={{ flexShrink: 0 }}>
        <SkipNextIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const repeatButton = (
    <Tooltip title={t('playlists.miniPlayer.repeat')}>
      <IconButton size="small" onClick={onToggleRepeat} sx={{ flexShrink: 0, color: isRepeat ? 'error.main' : undefined }}>
        <RepeatIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const shuffleButton = (
    <Tooltip title={t('playlists.miniPlayer.shuffle')}>
      <IconButton size="small" onClick={onToggleShuffle} sx={{ flexShrink: 0, color: isShuffle ? 'error.main' : undefined }}>
        <ShuffleIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const closeButton = (
    // ml: 'auto' — on desktop the <audio> element caps out at maxWidth: 500,
    // so on a wide window there's leftover flex space past it that nothing
    // else absorbs; without this, close just sits right after shuffle
    // instead of at the container's actual right edge.
    <Tooltip title={t('playlists.miniPlayer.close')}>
      <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0, ml: 'auto' }}>
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );

  // Acts like "back to playlist" + auto-scroll to the playing track there —
  // see PlaylistDetailPage's scrollToNowPlaying handling.
  const titleBlock = (
    <Tooltip title={t('playlists.miniPlayer.backToPlaylist')}>
      <Box onClick={onTitleClick} sx={{ minWidth: 0, cursor: 'pointer' }}>
        <Typography variant="body2" noWrap>
          {title ?? t('common.loading')}
        </Typography>
        {artist && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {artist}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );

  if (isMobile) {
    return (
      <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'background.paper',
        borderTop: '1px solid #2a2a2a', px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, zIndex: 1200 }}>
        {thumbnail}
        {previousButton}
        <Box sx={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {titleBlock}
          <audio
            ref={audioRef}
            controls
            style={{ width: '100%', height: 28 }}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
          />
        </Box>
        {nextButton}
        {repeatButton}
        {shuffleButton}
        {closeButton}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'fixed', bottom: 0, left: SIDEBAR_WIDTH, right: 0, bgcolor: 'background.paper',
      borderTop: '1px solid #2a2a2a', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1200 }}>
      {thumbnail}
      <Box sx={{ minWidth: 120, maxWidth: 280 }}>
        {titleBlock}
      </Box>
      {previousButton}
      <audio
        ref={audioRef}
        controls
        style={{ flexGrow: 1, height: 32, maxWidth: 500 }}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      />
      {nextButton}
      {repeatButton}
      {shuffleButton}
      {closeButton}
    </Box>
  );
}
