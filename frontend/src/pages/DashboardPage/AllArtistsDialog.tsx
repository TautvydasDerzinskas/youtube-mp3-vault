import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert,
  List, ListItem, ListItemText,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardArtist } from '../../api/dashboard';

export function AllArtistsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [artists, setArtists] = useState<DashboardArtist[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllArtists().then(setArtists).catch(() => setArtists('error'));
  }, []);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('dashboard.topArtists.title')}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: 480 }}>
        {artists === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {artists === 'error' && <Alert severity="error">{t('dashboard.loadError')}</Alert>}
        {Array.isArray(artists) && artists.length === 0 && (
          <Typography color="text.secondary">{t('dashboard.topArtists.empty')}</Typography>
        )}
        {Array.isArray(artists) && artists.length > 0 && (
          <List dense disablePadding>
            {artists.map((a, idx) => (
              <ListItem key={a.artist} sx={{ px: 1 }}>
                <Typography sx={{ width: 28, flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>{idx + 1}</Typography>
                <ListItemText primary={a.artist} primaryTypographyProps={{ noWrap: true }} />
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                  {t('dashboard.songCount', { count: a.songCount })}
                </Typography>
              </ListItem>
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
