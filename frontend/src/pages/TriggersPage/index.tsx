import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Alert, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, AdminUser } from '../../api/admin';
import { Playlist } from '../../api/youtube';
import { displayName } from '../PlaylistsPage/utils';

interface Result {
  type: 'success' | 'error';
  message: string;
}

export default function TriggersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedPlaylistId('');
    setPlaylists([]);
    setResult(null);
    if (!userId) return;

    setPlaylistsLoading(true);
    adminApi.getUser(userId)
      .then(({ playlists }) => setPlaylists(playlists))
      .catch(() => setResult({ type: 'error', message: t('triggers.loadPlaylistsError') }))
      .finally(() => setPlaylistsLoading(false));
  };

  const handleTrigger = async () => {
    if (!selectedPlaylistId) return;
    setTriggering(true);
    setResult(null);
    try {
      await adminApi.triggerSoftReimport(selectedPlaylistId);
      setResult({ type: 'success', message: t('triggers.softReimport.started') });
    } catch (err: any) {
      setResult({ type: 'error', message: err.response?.data?.error ?? t('triggers.softReimport.genericError') });
    } finally {
      setTriggering(false);
    }
  };

  if (users === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (users === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('triggers.loadUsersError')}</Alert>;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      <Typography variant="h5" fontWeight={700} mb={1}>{t('triggers.title')}</Typography>

      <Typography variant="subtitle1" fontWeight={600} mt={3} mb={1}>{t('triggers.softReimport.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('triggers.softReimport.description')}</Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          select
          label={t('triggers.selectUser')}
          value={selectedUserId}
          onChange={(e) => handleUserChange(e.target.value)}
          fullWidth
        >
          {users.map(u => (
            <MenuItem key={u.id} value={u.id}>{u.displayName} ({u.email})</MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label={t('triggers.selectPlaylist')}
          value={selectedPlaylistId}
          onChange={(e) => setSelectedPlaylistId(e.target.value)}
          disabled={!selectedUserId || playlistsLoading || playlists.length === 0}
          helperText={selectedUserId && !playlistsLoading && playlists.length === 0 ? t('triggers.noPlaylists') : undefined}
          fullWidth
        >
          {playlists.map(p => (
            <MenuItem key={p.id} value={p.id}>{displayName(p)}</MenuItem>
          ))}
        </TextField>

        {result && <Alert severity={result.type}>{result.message}</Alert>}

        <Button
          variant="contained"
          color="warning"
          disabled={!selectedPlaylistId || triggering}
          onClick={handleTrigger}
          sx={{ alignSelf: 'flex-start' }}
        >
          {triggering ? <CircularProgress size={20} color="inherit" /> : t('triggers.softReimport.trigger')}
        </Button>
      </Box>
    </Box>
  );
}
