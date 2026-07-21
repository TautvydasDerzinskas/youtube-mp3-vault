import { useEffect, useState } from 'react';
import { Box, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { LocalOffer as GenreIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, DashboardGenre } from '../../api/dashboard';
import { allTracksGenreUrl } from '../PlaylistsPage/utils';

// A tile grid rather than a table — genres are a "browse by category"
// concept, and a wrapping grid of clickable cards scans better for that than
// rows of a table would, especially once there are a lot of them.
export default function GenresPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [genres, setGenres] = useState<DashboardGenre[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllGenres().then(setGenres).catch(() => setGenres('error'));
  }, []);

  if (genres === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (genres === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('genres.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>{t('genres.title')}</Typography>

      {genres.length === 0 ? (
        <Typography color="text.secondary">{t('genres.empty')}</Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {genres.map((g) => (
            <Paper
              key={g.key}
              onClick={() => navigate(allTracksGenreUrl(g.key))}
              elevation={0}
              sx={{
                p: 2, display: 'flex', flexDirection: 'column', gap: 0.5, cursor: 'pointer',
                border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
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
    </Box>
  );
}
