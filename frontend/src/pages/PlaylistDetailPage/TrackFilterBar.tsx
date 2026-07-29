import {
  Box, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent, TextField, InputAdornment,
  Switch, FormControlLabel,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GenreCount, SortOption } from './hooks/genreFilter';
import { GenreFilterBar } from './GenreFilterBar';

interface TrackFilterBarProps {
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  hqOnly: boolean;
  onHqOnlyChange: (hqOnly: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

// Shared by PlaylistDetailPage and AllTracksPage. Layout is deliberately one
// row — sort, genre, HQ toggle grouped on the left, search pushed to the far
// right via the TextField's `ml: auto` — rather than stacked rows, so the
// header stays a fixed, predictable height.
export function TrackFilterBar({
  genreCounts, selectedGenres, onToggleGenre, onClearGenres,
  sort, onSortChange, hqOnly, onHqOnlyChange, searchQuery, onSearchQueryChange,
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

      <FormControlLabel
        sx={{ ml: 0 }}
        control={<Switch size="small" checked={hqOnly} onChange={(e) => onHqOnlyChange(e.target.checked)} />}
        label={t('playlists.detail.hqOnly')}
      />

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
