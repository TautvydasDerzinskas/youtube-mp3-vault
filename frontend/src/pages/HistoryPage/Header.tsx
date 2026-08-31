import { Box, Typography, Avatar, Chip, TextField, InputAdornment } from '@mui/material';
import { History as HistoryIcon, Search as SearchIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { formatPlaybackTime } from '../PlaylistsPage/utils';
import { HistorySummary } from './hooks/useHistoryDetail';
import { usePageBack, usePageTitle } from '../../contexts/PageBackContext';
import { useIsMobile } from '../../hooks/useIsMobile';

interface HeaderProps {
  summary: HistorySummary;
  visibleCount: number;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

// Same "virtual aggregate, not a real playlist" shape as AllTracksPage's own
// Header. Unlike AllTracksPage/PlaylistDetailPage, this deliberately has no
// TrackFilterBar (no sort/genre/HQ controls) — see useHistoryDetail's own
// doc comment for why: the list's whole point is a fixed "most recently
// played first" order, and sorting/filtering it down would work against
// that. Just a search box, kept because narrowing to a track you know you
// played doesn't fight the ordering the way sorting/filtering would.
export function Header({ summary, visibleCount, searchQuery, onSearchQueryChange }: HeaderProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  usePageBack('/playlists', t('common.backToPlaylists'));
  usePageTitle(t('playlists.history.title'));

  return (
    <Box sx={{ mb: 3, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Avatar variant="rounded" sx={{ width: 96, height: 72, borderRadius: 2, flexShrink: 0 }}>
          <HistoryIcon sx={{ fontSize: 32 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          {isMobile && (
            <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
              {t('playlists.history.title')}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: isMobile ? 0.25 : 0 }}>
            {summary.totalDurationSec > 0
              ? `${formatPlaybackTime(summary.totalDurationSec, t)} · ${t('playlists.history.description')}`
              : t('playlists.history.description')}
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <Chip size="small" variant="outlined"
              label={visibleCount !== summary.songCount
                ? t('playlists.detail.trackCountFiltered', { visible: visibleCount, total: summary.songCount })
                : t('playlists.detail.trackCount', { count: summary.songCount })} />
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 2 }}>
        <TextField
          size="small"
          placeholder={t('playlists.detail.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          sx={{ minWidth: 260 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            },
          }}
        />
      </Box>
    </Box>
  );
}
