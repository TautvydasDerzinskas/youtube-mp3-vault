import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Alert, TextField, InputAdornment, Avatar,
  FormControl, InputLabel, Select, MenuItem, SelectChangeEvent,
} from '@mui/material';
import { Search as SearchIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { artistsApi, ArtistSummary } from '../../api/artists';

// Search is backend-driven (matches artist name OR song title, see
// artistStats.ts) rather than filtered client-side — matching on song titles
// too would otherwise mean shipping every artist's full track-title list down
// just to filter locally. Debounced so typing doesn't fire a request per
// keystroke.
const SEARCH_DEBOUNCE_MS = 300;

// Sorting, unlike search, is done client-side — the backend already returns
// every matching artist in one shot, so re-sorting a small in-memory array
// doesn't warrant a round trip (and avoids a loading flicker on every
// dropdown change).
type SortOption = 'name-asc' | 'name-desc' | 'songCount-desc' | 'songCount-asc' | 'plays-desc' | 'plays-asc';
const DEFAULT_SORT: SortOption = 'name-asc';

function sortArtists(artists: ArtistSummary[], sort: SortOption): ArtistSummary[] {
  const sorted = [...artists];
  switch (sort) {
    case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'songCount-desc': return sorted.sort((a, b) => b.songCount - a.songCount || a.name.localeCompare(b.name));
    case 'songCount-asc': return sorted.sort((a, b) => a.songCount - b.songCount || a.name.localeCompare(b.name));
    case 'plays-desc': return sorted.sort((a, b) => b.totalPlayCount - a.totalPlayCount || a.name.localeCompare(b.name));
    case 'plays-asc': return sorted.sort((a, b) => a.totalPlayCount - b.totalPlayCount || a.name.localeCompare(b.name));
  }
}

export default function ArtistsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [artists, setArtists] = useState<ArtistSummary[] | 'loading' | 'error'>('loading');
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    artistsApi.list(debouncedQuery || undefined).then(setArtists).catch(() => setArtists('error'));
  }, [debouncedQuery]);

  const sortedArtists = useMemo(
    () => (Array.isArray(artists) ? sortArtists(artists, sort) : artists),
    [artists, sort],
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={2}>{t('artists.title')}</Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="artists-sort-label">{t('artists.sortBy')}</InputLabel>
          <Select
            labelId="artists-sort-label"
            label={t('artists.sortBy')}
            value={sort}
            onChange={(e: SelectChangeEvent) => setSort(e.target.value as SortOption)}
          >
            <MenuItem value="name-asc">{t('artists.sortNameAsc')}</MenuItem>
            <MenuItem value="name-desc">{t('artists.sortNameDesc')}</MenuItem>
            <MenuItem value="songCount-desc">{t('artists.sortSongCountDesc')}</MenuItem>
            <MenuItem value="songCount-asc">{t('artists.sortSongCountAsc')}</MenuItem>
            <MenuItem value="plays-desc">{t('artists.sortPlaysDesc')}</MenuItem>
            <MenuItem value="plays-asc">{t('artists.sortPlaysAsc')}</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder={t('artists.searchPlaceholder')}
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

      {sortedArtists === 'loading' ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}><CircularProgress /></Box>
      ) : sortedArtists === 'error' ? (
        <Alert severity="error">{t('artists.failedToLoad')}</Alert>
      ) : sortedArtists.length === 0 ? (
        <Typography color="text.secondary">
          {debouncedQuery ? t('artists.noResults') : t('artists.empty')}
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {sortedArtists.map((a) => (
            <Paper
              key={a.key}
              onClick={() => navigate(`/artists/${encodeURIComponent(a.key)}`)}
              elevation={0}
              sx={{
                p: 2, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer',
                border: '1px solid', borderColor: 'divider', borderRadius: '8px',
                '&:hover': { borderColor: 'primary.dark' },
              }}
            >
              <Avatar src={a.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 64, height: 64, borderRadius: 2 }}>
                <MusicNoteIcon />
              </Avatar>
              <Typography variant="subtitle2" fontWeight={600} noWrap>{a.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {sort.startsWith('plays')
                  ? t('dashboard.playCount', { count: a.totalPlayCount })
                  : t('dashboard.songCount', { count: a.songCount })}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
