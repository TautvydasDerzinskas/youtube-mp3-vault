import { useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, CircularProgress, Alert, Stack,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, Playlist } from '../../api/youtube';

export function AddPlaylistDialog({ open, onClose, onAdded }: {
  open: boolean; onClose: () => void; onAdded: (p: Playlist) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setUrl(''); setName(''); setError(null); };
  const handleClose = () => { if (!loading) { reset(); onClose(); } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { playlist } = await playlistsApi.add(url.trim(), name.trim() || undefined);
      reset();
      onAdded(playlist);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('playlists.addDialog.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('playlists.addDialog.title')}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label={t('playlists.addDialog.urlLabel')} placeholder="https://www.youtube.com/playlist?list=…"
            value={url} onChange={e => setUrl(e.target.value)} required fullWidth autoFocus disabled={loading} />
          <TextField label={t('playlists.addDialog.nameLabel')} placeholder={t('playlists.addDialog.namePlaceholder')}
            value={name} onChange={e => setName(e.target.value)} fullWidth disabled={loading} />
          {error && <Alert severity="error">{error}</Alert>}
          {loading && (
            <Stack direction="row" alignItems="center" gap={1.5}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                {t('playlists.addDialog.fetching')}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={loading || !url.trim()}>{t('playlists.addDialog.add')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
