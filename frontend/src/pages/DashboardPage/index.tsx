import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardSummary } from '../../api/dashboard';
import { PlaylistCountCard } from './PlaylistCountCard';
import { SongsOnRepeatCard } from './SongsOnRepeatCard';
import { TopArtistsCard } from './TopArtistsCard';
import { AllSongsDialog } from './AllSongsDialog';
import { AllArtistsDialog } from './AllArtistsDialog';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | 'loading' | 'error'>('loading');
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [showAllArtists, setShowAllArtists] = useState(false);

  useEffect(() => {
    dashboardApi.getSummary().then(setSummary).catch(() => setSummary('error'));
  }, []);

  if (summary === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (summary === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('dashboard.loadError')}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>{t('dashboard.title')}</Typography>

      {/* Bento/puzzle layout: the count tile only occupies row 1, while the
          songs/artists cards span both rows, so the count tile visibly reads
          as the smaller piece next to two taller ones. Collapses to a single
          stacked column on mobile. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr 1.4fr' },
          gridTemplateRows: { xs: 'auto', md: 'auto 1fr' },
          gridTemplateAreas: {
            xs: '"count" "songs" "artists"',
            md: '"count songs artists" ". songs artists"',
          },
        }}
      >
        <PlaylistCountCard count={summary.playlistCount} />
        <SongsOnRepeatCard songs={summary.topSongs} onSeeMore={() => setShowAllSongs(true)} />
        <TopArtistsCard artists={summary.topArtists} onSeeMore={() => setShowAllArtists(true)} />
      </Box>

      {showAllSongs && <AllSongsDialog onClose={() => setShowAllSongs(false)} />}
      {showAllArtists && <AllArtistsDialog onClose={() => setShowAllArtists(false)} />}
    </Box>
  );
}
