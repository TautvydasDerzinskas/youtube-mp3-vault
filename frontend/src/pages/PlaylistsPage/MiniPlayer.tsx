import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { SIDEBAR_WIDTH } from '../../components/Layout/constants';

interface MiniPlayerProps {
  title: string | undefined;
  audioRef: React.RefObject<HTMLAudioElement>;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onClose: () => void;
}

/**
 * Fixed bottom bar shown whenever a track is playing; owns no playback state itself.
 * Left-offset by the sidebar width so it sits over the main content area only,
 * rather than overlaying the sidebar's user/profile strip.
 */
export function MiniPlayer({ title, audioRef, onPlay, onPause, onEnded, onClose }: MiniPlayerProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ position: 'fixed', bottom: 0, left: SIDEBAR_WIDTH, right: 0, bgcolor: 'background.paper',
      borderTop: '1px solid #2a2a2a', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 2, zIndex: 1200 }}>
      <MusicNoteIcon sx={{ color: 'primary.main', flexShrink: 0 }} />
      <Typography variant="body2" noWrap sx={{ minWidth: 120, maxWidth: 280 }}>
        {title ?? t('common.loading')}
      </Typography>
      <audio
        ref={audioRef}
        controls
        style={{ flexGrow: 1, height: 32, maxWidth: 500 }}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      />
      <Tooltip title={t('playlists.miniPlayer.close')}>
        <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
