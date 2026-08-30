import {
  Box, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, TextField, InputAdornment,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GenreCount, SortOption, HqFilterOption } from './hooks/genreFilter';
import { GenreFilterBar } from './GenreFilterBar';

interface TrackFilterBarProps {
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

// Shared by PlaylistDetailPage and AllTracksPage. Layout is deliberately one
// row — sort, genre, HQ filter grouped on the left, search pushed to the far
// right via the TextField's `ml: auto` — rather than stacked rows, so the
// header stays a fixed, predictable height.
export function TrackFilterBar({
  genreCounts, selectedGenres, onToggleGenre, onClearGenres,
  sort, onSortChange, hqFilter, onHqFilterChange, searchQuery, onSearchQueryChange,
}: TrackFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="track-sort-label">{t('playlists.detail.sortBy')}</InputLabel>
        <Select
          labelId="track-sort-label"
          label={t('playlists.detail.sortBy')}
          value={sort}
          onChange={(e: SelectChangeEvent) => onSortChange(e.target.value as SortOption)}
        >
          <MenuItem value="import-desc">{t('playlists.detail.sortImportDesc')}</MenuItem>
          <MenuItem value="import-asc">{t('playlists.detail.sortImportAsc')}</MenuItem>
          <MenuItem value="name-asc">{t('playlists.detail.sortNameAsc')}</MenuItem>
          <MenuItem value="name-desc">{t('playlists.detail.sortNameDesc')}</MenuItem>
          <MenuItem value="artist-asc">{t('playlists.detail.sortArtistAsc')}</MenuItem>
          <MenuItem value="artist-desc">{t('playlists.detail.sortArtistDesc')}</MenuItem>
          <MenuItem value="plays-desc">{t('playlists.detail.sortPlaysDesc')}</MenuItem>
          <MenuItem value="plays-asc">{t('playlists.detail.sortPlaysAsc')}</MenuItem>
        </Select>
      </FormControl>

      <GenreFilterBar
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
      />

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="track-hq-filter-label">{t('playlists.detail.hqFilterLabel')}</InputLabel>
        <Select
          labelId="track-hq-filter-label"
          label={t('playlists.detail.hqFilterLabel')}
          value={hqFilter}
          onChange={(e: SelectChangeEvent) => onHqFilterChange(e.target.value as HqFilterOption)}
        >
          <MenuItem value="all">{t('playlists.detail.hqFilterAll')}</MenuItem>
          <MenuItem value="hq">{t('playlists.detail.hqFilterHqOnly')}</MenuItem>
          <MenuItem value="lq">{t('playlists.detail.hqFilterLqOnly')}</MenuItem>
        </Select>
      </FormControl>

      <TextField
        size="small"
        placeholder={t('playlists.detail.searchPlaceholder')}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        sx={{ ml: 'auto', minWidth: 220 }}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          },
        }}
      />
    </Box>
  );
}
