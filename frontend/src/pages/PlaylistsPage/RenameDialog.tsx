import { useState } from 'react';
import {
  Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, Playlist } from '../../api/youtube';

export function RenameDialog({ playlist, onClose, onRenamed }: {
  playlist: Playlist; onClose: () => void; onRenamed: (p: Playlist) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(playlist.customName ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { playlist: updated } = await playlistsApi.rename(playlist.id, value.trim() || null);
      onRenamed(updated);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('playlists.renameDialog.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('playlists.renameDialog.title')}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1 }}>
          <TextField label={t('playlists.renameDialog.displayNameLabel')} value={value} onChange={e => setValue(e.target.value)}
            fullWidth autoFocus helperText={t('playlists.renameDialog.helperText')} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={loading}>{t('common.save')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
