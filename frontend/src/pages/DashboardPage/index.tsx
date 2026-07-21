import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardSummary } from '../../api/dashboard';
import { PlaylistCountCard } from './PlaylistCountCard';
import { TotalSongsCard } from './TotalSongsCard';
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

      {/* Bento/puzzle layout: count + totalSongs stack in column 1, while the
          songs/artists cards span both rows in columns 2-3, so the two small
          tiles visibly read as smaller pieces next to two taller ones.
          alignItems: 'start' keeps each card sized to its own content —
          without it, a spanning grid item stretches to fill its full row
          span by default, which was leaving dead space below "See more" on
          whichever of songs/artists had the shorter list. Collapses to a
          single stacked column on mobile. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr 1.4fr' },
          gridTemplateRows: { xs: 'auto', md: 'auto auto' },
          gridTemplateAreas: {
            xs: '"count" "totalSongs" "songs" "artists"',
            md: '"count songs artists" "totalSongs songs artists"',
          },
        }}
      >
        <PlaylistCountCard count={summary.playlistCount} />
        <TotalSongsCard count={summary.totalSongCount} />
        <SongsOnRepeatCard songs={summary.topSongs} onSeeMore={() => setShowAllSongs(true)} />
        <TopArtistsCard artists={summary.topArtists} onSeeMore={() => setShowAllArtists(true)} />
      </Box>

      {showAllSongs && <AllSongsDialog onClose={() => setShowAllSongs(false)} />}
      {showAllArtists && <AllArtistsDialog onClose={() => setShowAllArtists(false)} />}
    </Box>
  );
}
