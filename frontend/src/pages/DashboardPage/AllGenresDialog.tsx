import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert,
  List, ListItemButton, ListItemText,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, DashboardGenre } from '../../api/dashboard';
import { allTracksGenreUrl } from '../PlaylistsPage/utils';

export function AllGenresDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [genres, setGenres] = useState<DashboardGenre[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllGenres().then(setGenres).catch(() => setGenres('error'));
  }, []);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('dashboard.topGenres.title')}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: 480 }}>
        {genres === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {genres === 'error' && <Alert severity="error">{t('dashboard.loadError')}</Alert>}
        {Array.isArray(genres) && genres.length === 0 && (
          <Typography color="text.secondary">{t('dashboard.topGenres.empty')}</Typography>
        )}
        {Array.isArray(genres) && genres.length > 0 && (
          <List dense disablePadding>
            {genres.map((g, idx) => (
              <ListItemButton
                key={g.key}
                onClick={() => { onClose(); navigate(allTracksGenreUrl(g.key)); }}
                sx={{ borderRadius: 1, px: 1 }}
              >
                <Typography sx={{ width: 28, flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>{idx + 1}</Typography>
                <ListItemText primary={g.genre} primaryTypographyProps={{ noWrap: true }} />
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                  {t('dashboard.songCount', { count: g.count })}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
