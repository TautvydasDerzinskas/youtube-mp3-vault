import { useEffect, useState } from 'react';
import { Box, CircularProgress, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardSummary } from '../../api/dashboard';
import { PlaylistCountCard } from './PlaylistCountCard';
import { TotalSongsCard } from './TotalSongsCard';
import { ArtistCountCard } from './ArtistCountCard';
import { GenreCountCard } from './GenreCountCard';
import { SongsOnRepeatCard } from './SongsOnRepeatCard';
import { TopArtistsCard } from './TopArtistsCard';
import { TopGenresCard } from './TopGenresCard';
import { AllSongsDialog } from './AllSongsDialog';
import { AllArtistsDialog } from './AllArtistsDialog';
import { AllGenresDialog } from './AllGenresDialog';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DashboardSummary | 'loading' | 'error'>('loading');
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);

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
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          alignItems: 'flex-start',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: { xs: '100%', md: 0 }, flex: { md: 1 } }}>
          <PlaylistCountCard count={summary.playlistCount} />
          <TotalSongsCard count={summary.totalSongCount} />
          <ArtistCountCard count={summary.totalArtistCount} />
          <GenreCountCard count={summary.totalGenreCount} />
        </Box>
        <Box sx={{ width: { xs: '100%', md: 0 }, flex: { md: 1.4 } }}>
          <SongsOnRepeatCard songs={summary.topSongs} onSeeMore={() => setShowAllSongs(true)} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: { xs: '100%', md: 0 }, flex: { md: 1.4 } }}>
          <TopArtistsCard artists={summary.topArtists} onSeeMore={() => setShowAllArtists(true)} />
          <TopGenresCard genres={summary.topGenres} onSeeMore={() => setShowAllGenres(true)} />
        </Box>
      </Box>

      {showAllSongs && <AllSongsDialog onClose={() => setShowAllSongs(false)} />}
      {showAllArtists && <AllArtistsDialog onClose={() => setShowAllArtists(false)} />}
      {showAllGenres && <AllGenresDialog onClose={() => setShowAllGenres(false)} />}
    </Box>
  );
}
