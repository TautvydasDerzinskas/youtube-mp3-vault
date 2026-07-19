import { Box, Typography, IconButton, Tooltip, Avatar } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Close as CloseIcon,
  SkipPrevious as SkipPreviousIcon, SkipNext as SkipNextIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { SIDEBAR_WIDTH } from './constants';

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

/**
 * Fixed bottom bar shown whenever a track is playing; owns no playback state itself.
 * Rendered from AppLayout (not a page) so it persists across route changes.
 * Left-offset by the sidebar width so it sits over the main content area only,
 * rather than overlaying the sidebar's user/profile strip.
 */
export function MiniPlayer({
  title, thumbnailUrl, audioRef, hasNext, hasPrevious,
  onPlay, onPause, onEnded, onNext, onPrevious, onClose,
}: MiniPlayerProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ position: 'fixed', bottom: 0, left: SIDEBAR_WIDTH, right: 0, bgcolor: 'background.paper',
      borderTop: '1px solid #2a2a2a', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1200 }}>
      <Avatar src={thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 40, height: 40, borderRadius: 1, flexShrink: 0 }}>
        <MusicNoteIcon />
      </Avatar>
      <Typography variant="body2" noWrap sx={{ minWidth: 120, maxWidth: 280 }}>
        {title ?? t('common.loading')}
      </Typography>
      {hasPrevious && (
        <Tooltip title={t('playlists.miniPlayer.previous')}>
          <IconButton size="small" onClick={onPrevious} sx={{ flexShrink: 0 }}>
            <SkipPreviousIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <audio
        ref={audioRef}
        controls
        style={{ flexGrow: 1, height: 32, maxWidth: 500 }}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      />
      {hasNext && (
        <Tooltip title={t('playlists.miniPlayer.next')}>
          <IconButton size="small" onClick={onNext} sx={{ flexShrink: 0 }}>
            <SkipNextIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={t('playlists.miniPlayer.close')}>
        <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
