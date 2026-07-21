import {
  Box, FormControl, InputLabel, Select, OutlinedInput, MenuItem, Checkbox, ListItemText,
  IconButton, Tooltip, SelectChangeEvent,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GenreCount, NO_GENRE_KEY } from './hooks/genreFilter';

interface GenreFilterBarProps {
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
}

// Shared by PlaylistDetailPage and AllTracksPage — both filter a track list
// by genre the same way, just sourced from a different set of tracks.
//
// A multi-select dropdown rather than an inline chip cloud: a library with a
// lot of genres (an "All Tracks" aggregate especially) could previously push
// the track list itself off-screen once "show more" revealed everything.
// The dropdown's menu scrolls internally instead, so the header stays a
// fixed height no matter how many genres exist.
export function GenreFilterBar({ genreCounts, selectedGenres, onToggleGenre, onClearGenres }: GenreFilterBarProps) {
  const { t } = useTranslation();

  if (genreCounts.length === 0) return null;

  const genreLabel = (key: string, label: string, count: number) =>
    key === NO_GENRE_KEY ? t('playlists.detail.noGenre', { count }) : `${label} (${count})`;

  // The Select gives us the whole new selection at once; onToggleGenre only
  // knows how to flip one key, so reconcile by toggling whatever changed.
  const handleChange = (event: SelectChangeEvent<string[]>) => {
    const { value } = event.target;
    const next = new Set(typeof value === 'string' ? value.split(',') : value);
    for (const { key } of genreCounts) {
      if (selectedGenres.has(key) !== next.has(key)) onToggleGenre(key);
    }
  };

  return (
    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
      <FormControl size="small" sx={{ minWidth: 220, maxWidth: 420 }}>
        <InputLabel id="genre-filter-label">{t('playlists.detail.filterByGenre')}</InputLabel>
        <Select
          labelId="genre-filter-label"
          multiple
          value={[...selectedGenres]}
          onChange={handleChange}
          input={<OutlinedInput label={t('playlists.detail.filterByGenre')} />}
          renderValue={(selected) => (selected as string[])
            .map(key => genreCounts.find(g => g.key === key))
            .filter((g): g is GenreCount => Boolean(g))
            .map(g => (g.key === NO_GENRE_KEY ? t('playlists.detail.noGenre', { count: g.count }) : g.label))
            .join(', ')}
          MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
        >
          {genreCounts.map(({ key, label, count }) => (
            <MenuItem key={key} value={key} sx={key === NO_GENRE_KEY ? { fontStyle: 'italic' } : undefined}>
              <Checkbox size="small" checked={selectedGenres.has(key)} />
              <ListItemText primary={genreLabel(key, label, count)} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedGenres.size > 0 && (
        <Tooltip title={t('playlists.detail.clearGenreFilter')}>
          <IconButton size="small" onClick={onClearGenres}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
