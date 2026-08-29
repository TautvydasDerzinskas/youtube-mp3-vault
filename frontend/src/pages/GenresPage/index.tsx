import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, TextField, InputAdornment,
  FormControl, InputLabel, Select, MenuItem, SelectChangeEvent,
} from '@mui/material';
import { LocalOffer as GenreIcon, Search as SearchIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, DashboardGenre } from '../../api/dashboard';
import { allTracksGenreUrl } from '../PlaylistsPage/utils';

// Sorting and search are both client-side, local `useState` — the backend
// already returns every genre in one shot (there's no pagination to defeat),
// matching ArtistsPage's identical "small list, no round trip" reasoning.
type SortOption = 'name-asc' | 'name-desc' | 'songCount-desc' | 'songCount-asc';
const DEFAULT_SORT: SortOption = 'name-asc';

function sortGenres(genres: DashboardGenre[], sort: SortOption): DashboardGenre[] {
  const sorted = [...genres];
  switch (sort) {
    case 'name-asc': return sorted.sort((a, b) => a.genre.localeCompare(b.genre));
    case 'name-desc': return sorted.sort((a, b) => b.genre.localeCompare(a.genre));
    case 'songCount-desc': return sorted.sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
    case 'songCount-asc': return sorted.sort((a, b) => a.count - b.count || a.genre.localeCompare(b.genre));
  }
}

// A tile grid rather than a table — genres are a "browse by category"
// concept, and a wrapping grid of clickable cards scans better for that than
// rows of a table would, especially once there are a lot of them.
export default function GenresPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [genres, setGenres] = useState<DashboardGenre[] | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [query, setQuery] = useState('');

  useEffect(() => {
    dashboardApi.getAllGenres().then(setGenres).catch(() => setGenres('error'));
  }, []);

  const visibleGenres = useMemo(() => {
    if (!Array.isArray(genres)) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? genres.filter(g => g.genre.toLowerCase().includes(q)) : genres;
    return sortGenres(filtered, sort);
  }, [genres, sort, query]);

  if (genres === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (genres === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('genres.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={2}>{t('genres.title')}</Typography>

      {genres.length === 0 ? (
        <Typography color="text.secondary">{t('genres.empty')}</Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="genres-sort-label">{t('genres.sortBy')}</InputLabel>
              <Select
                labelId="genres-sort-label"
                label={t('genres.sortBy')}
                value={sort}
                onChange={(e: SelectChangeEvent) => setSort(e.target.value as SortOption)}
              >
                <MenuItem value="name-asc">{t('genres.sortNameAsc')}</MenuItem>
                <MenuItem value="name-desc">{t('genres.sortNameDesc')}</MenuItem>
                <MenuItem value="songCount-desc">{t('genres.sortSongCountDesc')}</MenuItem>
                <MenuItem value="songCount-asc">{t('genres.sortSongCountAsc')}</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              placeholder={t('genres.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ ml: 'auto', minWidth: 220, maxWidth: 400 }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
                },
              }}
            />
          </Box>

          {visibleGenres.length === 0 ? (
            <Typography color="text.secondary">{t('genres.noResults')}</Typography>
          ) : (
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {visibleGenres.map((g) => (
                <Paper
                  key={g.key}
                  onClick={() => navigate(allTracksGenreUrl(g.key))}
                  elevation={0}
                  sx={{
                    p: 2, display: 'flex', flexDirection: 'column', gap: 0.5, cursor: 'pointer',
                    border: '1px solid', borderColor: 'divider', borderRadius: '8px',
                    '&:hover': { borderColor: 'primary.dark' },
                  }}
                >
                  <GenreIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                  <Typography variant="subtitle2" fontWeight={600} noWrap>{g.genre}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('dashboard.songCount', { count: g.count })}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
