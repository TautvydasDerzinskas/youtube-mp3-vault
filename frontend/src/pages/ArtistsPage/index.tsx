import { useEffect, useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert, TextField, InputAdornment, Avatar } from '@mui/material';
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

export default function ArtistsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [artists, setArtists] = useState<ArtistSummary[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    artistsApi.list(debouncedQuery || undefined).then(setArtists).catch(() => setArtists('error'));
  }, [debouncedQuery]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={2}>{t('artists.title')}</Typography>

      <TextField
        fullWidth
        size="small"
        placeholder={t('artists.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 3, maxWidth: 400 }}
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          },
        }}
      />

      {artists === 'loading' ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}><CircularProgress /></Box>
      ) : artists === 'error' ? (
        <Alert severity="error">{t('artists.failedToLoad')}</Alert>
      ) : artists.length === 0 ? (
        <Typography color="text.secondary">
          {debouncedQuery ? t('artists.noResults') : t('artists.empty')}
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {artists.map((a) => (
            <Paper
              key={a.key}
              onClick={() => navigate(`/artists/${encodeURIComponent(a.key)}`)}
              elevation={0}
              sx={{
                p: 2, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer',
                border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
                '&:hover': { borderColor: 'primary.dark' },
              }}
            >
              <Avatar src={a.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 64, height: 64, borderRadius: 2 }}>
                <MusicNoteIcon />
              </Avatar>
              <Typography variant="subtitle2" fontWeight={600} noWrap>{a.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('dashboard.songCount', { count: a.songCount })}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
