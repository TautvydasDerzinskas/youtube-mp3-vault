import { Box, Typography, Avatar, Chip } from '@mui/material';
import { History as HistoryIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GenreCount, SortOption, HqFilterOption } from '../PlaylistDetailPage/hooks/genreFilter';
import { TrackFilterBar } from '../PlaylistDetailPage/TrackFilterBar';
import { formatPlaybackTime } from '../PlaylistsPage/utils';
import { HistorySummary } from './hooks/useHistoryDetail';
import { usePageBack } from '../../contexts/PageBackContext';

interface HeaderProps {
  summary: HistorySummary;
  visibleCount: number;
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  hqFilter: HqFilterOption;
  onHqFilterChange: (hqFilter: HqFilterOption) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

// Same "virtual aggregate, not a real playlist" shape as AllTracksPage's own
// Header — see that component's doc comment for why there's no thumbnail/
// rename/sync concept here either.
export function Header({
  summary, visibleCount, genreCounts, selectedGenres, onToggleGenre, onClearGenres,
  sort, onSortChange, hqFilter, onHqFilterChange, searchQuery, onSearchQueryChange,
}: HeaderProps) {
  const { t } = useTranslation();
  usePageBack('/playlists', t('common.backToPlaylists'));

  return (
    <Box sx={{ mb: 3, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Avatar variant="rounded" sx={{ width: 96, height: 72, borderRadius: 2, flexShrink: 0 }}>
          <HistoryIcon sx={{ fontSize: 32 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
            {t('playlists.history.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
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

      <TrackFilterBar
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
        sort={sort}
        onSortChange={onSortChange}
        hqFilter={hqFilter}
        onHqFilterChange={onHqFilterChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />
    </Box>
  );
}
