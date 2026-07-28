import { Paper, Typography } from '@mui/material';
import { Mic as ArtistsIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function ArtistCountCard({ count }: { count: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper
      onClick={() => navigate('/artists')}
      elevation={0}
      sx={{
        gridArea: 'artistCount',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 1,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: '#2a2a2a',
        borderRadius: '8px',
        minHeight: 140,
        '&:hover': { borderColor: 'primary.dark' },
      }}
    >
      <ArtistsIcon sx={{ fontSize: 32, color: 'primary.main' }} />
      <Typography variant="h3" fontWeight={700}>{count}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t('dashboard.artistCount.label', { count })}
      </Typography>
    </Paper>
  );
}
