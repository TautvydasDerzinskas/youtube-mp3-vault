import { Box, Typography, Avatar, Chip } from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GenreCount, NO_GENRE_KEY, SortOption, HqFilterOption, FavouriteFilterOption } from '../PlaylistDetailPage/hooks/genreFilter';
import { TrackFilterBar } from '../PlaylistDetailPage/TrackFilterBar';
import { formatPlaybackTime } from '../PlaylistsPage/utils';
import { AllTracksSummary } from './hooks/useAllTracksDetail';
import { usePageBack, usePageTitle } from '../../contexts/PageBackContext';
import { useIsMobile } from '../../hooks/useIsMobile';

interface HeaderProps {
  summary: AllTracksSummary;
  visibleCount: number;
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  hqFilter: HqFilterOption;
  onHqFilterChange: (hqFilter: HqFilterOption) => void;
  favouriteFilter: FavouriteFilterOption;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

// Deliberately not the real PlaylistDetailPage Header — this is a virtual
// aggregate, not a real playlist, so there's no thumbnail, no rename/sync
// concept, and no "synced X/Y" chip to show (nothing here is ever "synced"
// as a whole — each track's own download state is already visible in its
// row). Only the track filter/sort bar carries over, since that's the one
// thing this page is explicitly meant to behave like a playlist page for.
export function Header({
  summary, visibleCount, genreCounts, selectedGenres, onToggleGenre, onClearGenres,
  sort, onSortChange, hqFilter, onHqFilterChange,
  favouriteFilter, searchQuery, onSearchQueryChange,
}: HeaderProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // Reused by FavouritesListItem (see its own doc comment) via ?fav=favourite
  // rather than a dedicated route/page — so the title needs to reflect
  // whichever entry point brought the user here, not always say "All Tracks".
  // Same idea for a single-genre deep link (see allTracksGenreUrl): once
  // exactly one genre is selected, that's a much more useful heading than
  // the generic page title — falls back to it once a second genre is added,
  // since there's no single name left to show.
  const singleSelectedGenre = selectedGenres.size === 1
    ? genreCounts.find(g => selectedGenres.has(g.key))
    : undefined;
  const title = singleSelectedGenre
    ? (singleSelectedGenre.key === NO_GENRE_KEY ? t('playlists.detail.noGenre', { count: singleSelectedGenre.count }) : singleSelectedGenre.label)
    : favouriteFilter === 'favourite' ? t('playlists.favourites.title') : t('playlists.allTracks.title');
  usePageBack('/playlists', t('common.backToPlaylists'));
  usePageTitle(title);

  return (
    <Box sx={{ mb: 3, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Avatar variant="rounded" sx={{ width: 96, height: 72, borderRadius: 2, flexShrink: 0 }}>
          <MusicNoteIcon sx={{ fontSize: 32 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          {isMobile && (
            <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
              {title}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: isMobile ? 0.25 : 0 }}>
            {summary.totalDurationSec > 0
              ? `${formatPlaybackTime(summary.totalDurationSec, t)} · ${t('playlists.allTracks.sourcedFromYoutube')}`
              : t('playlists.allTracks.sourcedFromYoutube')}
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
