import { Paper, Typography, Box, List, ListItemButton, ListItemText, Button } from '@mui/material';
import { Star as ArtistIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DashboardArtist } from '../../api/dashboard';

interface Props {
  artists: DashboardArtist[];
  onSeeMore: () => void;
}

export function TopArtistsCard({ artists, onSeeMore }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper elevation={0} sx={{
      gridArea: 'artists', p: 2.5, border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ArtistIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>{t('dashboard.topArtists.title')}</Typography>
      </Box>

      {artists.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t('dashboard.topArtists.empty')}</Typography>
      ) : (
        <List dense disablePadding>
          {artists.map((a, idx) => (
            <ListItemButton key={a.key} onClick={() => navigate(`/artists/${encodeURIComponent(a.key)}`)} sx={{ borderRadius: 1, px: 1 }}>
              <Typography sx={{ width: 24, flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>{idx + 1}</Typography>
              <ListItemText primary={a.artist} primaryTypographyProps={{ noWrap: true }} />
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                {t('dashboard.songCount', { count: a.songCount })}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}

      <Button onClick={onSeeMore} sx={{ alignSelf: 'flex-start', mt: 1 }}>{t('dashboard.seeMore')}</Button>
    </Paper>
  );
}
