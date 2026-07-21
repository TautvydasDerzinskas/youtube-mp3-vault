import { Box, Typography, Avatar, Chip, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GenreCount } from '../PlaylistDetailPage/hooks/genreFilter';
import { GenreFilterBar } from '../PlaylistDetailPage/GenreFilterBar';
import { formatPlaybackTime } from '../PlaylistsPage/utils';
import { AllTracksSummary } from './hooks/useAllTracksDetail';

interface HeaderProps {
  summary: AllTracksSummary;
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
}

// Deliberately not the real PlaylistDetailPage Header — this is a virtual
// aggregate, not a real playlist, so there's no thumbnail, no rename/sync
// concept, and no "synced X/Y" chip to show (nothing here is ever "synced"
// as a whole — each track's own download state is already visible in its
// row). Only genre filtering carries over, since that's the one thing this
// page is explicitly meant to behave like a playlist page for.
export function Header({ summary, genreCounts, selectedGenres, onToggleGenre, onClearGenres }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box sx={{ mb: 3, flexShrink: 0 }}>
      <Tooltip title={t('playlists.detail.back')}>
        <IconButton onClick={() => navigate('/playlists')} sx={{ mb: 1, ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Avatar variant="rounded" sx={{ width: 96, height: 72, borderRadius: 2, flexShrink: 0 }}>
          <MusicNoteIcon sx={{ fontSize: 32 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
            {t('playlists.allTracks.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {summary.totalDurationSec > 0
              ? `${formatPlaybackTime(summary.totalDurationSec, t)} · ${t('playlists.allTracks.sourcedFromYoutube')}`
              : t('playlists.allTracks.sourcedFromYoutube')}
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <Chip size="small" variant="outlined" label={t('playlists.detail.trackCount', { count: summary.songCount })} />
          </Box>
        </Box>
      </Box>

      <GenreFilterBar
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
      />
    </Box>
  );
}
