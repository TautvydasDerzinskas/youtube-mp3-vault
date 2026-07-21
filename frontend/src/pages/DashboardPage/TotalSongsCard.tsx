import { Paper, Typography } from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Not clickable — unlike PlaylistCountCard, there's no single "all songs
// across every playlist" route in this app to navigate to.
export function TotalSongsCard({ count }: { count: number }) {
  const { t } = useTranslation();

  return (
    <Paper
      elevation={0}
      sx={{
        gridArea: 'totalSongs',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 1,
        border: '1px solid',
        borderColor: '#2a2a2a',
        borderRadius: '8px',
        minHeight: 140,
      }}
    >
      <MusicNoteIcon sx={{ fontSize: 32, color: 'primary.main' }} />
      <Typography variant="h3" fontWeight={700}>{count}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('dashboard.totalSongCount.label', { count })}
      </Typography>
    </Paper>
  );
}
