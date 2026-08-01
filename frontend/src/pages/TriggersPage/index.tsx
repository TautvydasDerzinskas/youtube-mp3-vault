import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Alert, CircularProgress, Divider } from '@mui/material';
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

  const [reimportTriggering, setReimportTriggering] = useState(false);
  const [reimportResult, setReimportResult] = useState<Result | null>(null);

  const [tagRebuildTriggering, setTagRebuildTriggering] = useState(false);
  const [tagRebuildResult, setTagRebuildResult] = useState<Result | null>(null);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedPlaylistId('');
    setPlaylists([]);
    setReimportResult(null);
    setTagRebuildResult(null);
    if (!userId) return;

    setPlaylistsLoading(true);
    adminApi.getUser(userId)
      .then(({ playlists }) => setPlaylists(playlists))
      .catch(() => setReimportResult({ type: 'error', message: t('triggers.loadPlaylistsError') }))
      .finally(() => setPlaylistsLoading(false));
  };

  const handleTriggerReimport = async () => {
    if (!selectedPlaylistId) return;
    setReimportTriggering(true);
    setReimportResult(null);
    try {
      await adminApi.triggerSoftReimport(selectedPlaylistId);
      setReimportResult({ type: 'success', message: t('triggers.softReimport.started') });
    } catch (err: any) {
      setReimportResult({ type: 'error', message: err.response?.data?.error ?? t('triggers.softReimport.genericError') });
    } finally {
      setReimportTriggering(false);
    }
  };

  const handleTriggerTagRebuild = async () => {
    if (!selectedPlaylistId) return;
    setTagRebuildTriggering(true);
    setTagRebuildResult(null);
    try {
      await adminApi.triggerTagRebuild(selectedPlaylistId);
      setTagRebuildResult({ type: 'success', message: t('triggers.tagRebuild.started') });
    } catch (err: any) {
      setTagRebuildResult({ type: 'error', message: err.response?.data?.error ?? t('triggers.tagRebuild.genericError') });
    } finally {
      setTagRebuildTriggering(false);
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

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
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
      </Box>

      <Typography variant="subtitle1" fontWeight={600} mb={1}>{t('triggers.softReimport.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('triggers.softReimport.description')}</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        {reimportResult && <Alert severity={reimportResult.type}>{reimportResult.message}</Alert>}
        <Button
          variant="contained"
          color="warning"
          disabled={!selectedPlaylistId || reimportTriggering}
          onClick={handleTriggerReimport}
          sx={{ alignSelf: 'flex-start' }}
        >
          {reimportTriggering ? <CircularProgress size={20} color="inherit" /> : t('triggers.softReimport.trigger')}
        </Button>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} mb={1}>{t('triggers.tagRebuild.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('triggers.tagRebuild.description')}</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tagRebuildResult && <Alert severity={tagRebuildResult.type}>{tagRebuildResult.message}</Alert>}
        <Button
          variant="contained"
          color="warning"
          disabled={!selectedPlaylistId || tagRebuildTriggering}
          onClick={handleTriggerTagRebuild}
          sx={{ alignSelf: 'flex-start' }}
        >
          {tagRebuildTriggering ? <CircularProgress size={20} color="inherit" /> : t('triggers.tagRebuild.trigger')}
        </Button>
      </Box>
    </Box>
  );
}
