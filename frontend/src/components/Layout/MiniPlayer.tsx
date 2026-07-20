import { Box, Typography, IconButton, Tooltip, Avatar } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Close as CloseIcon,
  SkipPrevious as SkipPreviousIcon, SkipNext as SkipNextIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { SIDEBAR_WIDTH } from './constants';
import { useIsMobile } from '../../hooks/useIsMobile';

interface MiniPlayerProps {
  title: string | undefined;
  thumbnailUrl: string | null | undefined;
  audioRef: React.RefObject<HTMLAudioElement>;
  hasNext: boolean;
  hasPrevious: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export function MiniPlayer({
  title, thumbnailUrl, audioRef, hasNext, hasPrevious,
  onPlay, onPause, onEnded, onNext, onPrevious, onClose,
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
  const closeButton = (
    <Tooltip title={t('playlists.miniPlayer.close')}>
      <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );

  if (isMobile) {
    return (
      <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'background.paper',
        borderTop: '1px solid #2a2a2a', px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, zIndex: 1200 }}>
        {thumbnail}
        {previousButton}
        <Box sx={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Typography variant="body2" noWrap>
            {title ?? t('common.loading')}
          </Typography>
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
        {closeButton}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'fixed', bottom: 0, left: SIDEBAR_WIDTH, right: 0, bgcolor: 'background.paper',
      borderTop: '1px solid #2a2a2a', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1200 }}>
      {thumbnail}
      <Typography variant="body2" noWrap sx={{ minWidth: 120, maxWidth: 280 }}>
        {title ?? t('common.loading')}
      </Typography>
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
      {closeButton}
    </Box>
  );
}
