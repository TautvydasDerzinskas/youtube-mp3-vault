import { Paper, Typography, Box, List, ListItemButton, ListItemText, Button } from '@mui/material';
import { LocalOffer as GenreIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DashboardGenre } from '../../api/dashboard';
import { allTracksGenreUrl } from '../PlaylistsPage/utils';

interface Props {
  genres: DashboardGenre[];
  onSeeMore: () => void;
}

export function TopGenresCard({ genres, onSeeMore }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper elevation={0} sx={{
      gridArea: 'genres', p: 2.5, border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <GenreIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>{t('dashboard.topGenres.title')}</Typography>
      </Box>

      {genres.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t('dashboard.topGenres.empty')}</Typography>
      ) : (
        <List dense disablePadding>
          {genres.map((g, idx) => (
            <ListItemButton key={g.key} onClick={() => navigate(allTracksGenreUrl(g.key))} sx={{ borderRadius: 1, px: 1 }}>
              <Typography sx={{ width: 24, flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>{idx + 1}</Typography>
              <ListItemText primary={g.genre} primaryTypographyProps={{ noWrap: true }} />
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                {t('dashboard.songCount', { count: g.count })}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}

      <Button onClick={onSeeMore} sx={{ alignSelf: 'flex-start', mt: 1 }}>{t('dashboard.seeMore')}</Button>
    </Paper>
  );
}
