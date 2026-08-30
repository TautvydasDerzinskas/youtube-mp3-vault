import { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, Alert, CircularProgress, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, AdminUser } from '../../api/admin';
import { Playlist } from '../../api/youtube';
import { displayName } from '../PlaylistsPage/utils';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageBackContext';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function TriggersPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  usePageTitle(t('triggers.title'));
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');

  const [reimportTriggering, setReimportTriggering] = useState(false);
  const [tagRebuildTriggering, setTagRebuildTriggering] = useState(false);
  const [originalTitleBackfillTriggering, setOriginalTitleBackfillTriggering] = useState(false);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedPlaylistId('');
    setPlaylists([]);
    if (!userId) return;

    setPlaylistsLoading(true);
    adminApi.getUser(userId)
      .then(({ playlists }) => setPlaylists(playlists))
      .catch(() => showError(t('triggers.loadPlaylistsError')))
      .finally(() => setPlaylistsLoading(false));
  };

  const handleTriggerReimport = async () => {
    if (!selectedPlaylistId) return;
    setReimportTriggering(true);
    try {
      await adminApi.triggerSoftReimport(selectedPlaylistId);
      showSuccess(t('triggers.softReimport.started'));
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('triggers.softReimport.genericError'));
    } finally {
      setReimportTriggering(false);
    }
  };

  const handleTriggerTagRebuild = async () => {
    if (!selectedPlaylistId) return;
    setTagRebuildTriggering(true);
    try {
      await adminApi.triggerTagRebuild(selectedPlaylistId);
      showSuccess(t('triggers.tagRebuild.started'));
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('triggers.tagRebuild.genericError'));
    } finally {
      setTagRebuildTriggering(false);
    }
  };

  const handleTriggerOriginalTitleBackfill = async () => {
    setOriginalTitleBackfillTriggering(true);
    try {
      await adminApi.triggerOriginalTitleBackfill();
      showSuccess(t('triggers.originalTitleBackfill.started'));
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('triggers.originalTitleBackfill.genericError'));
    } finally {
      setOriginalTitleBackfillTriggering(false);
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
      {isMobile && <Typography variant="h5" fontWeight={700} mb={1}>{t('triggers.title')}</Typography>}

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

      <Divider sx={{ mb: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} mb={1}>{t('triggers.originalTitleBackfill.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('triggers.originalTitleBackfill.description')}</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Button
          variant="contained"
          color="warning"
          disabled={originalTitleBackfillTriggering}
          onClick={handleTriggerOriginalTitleBackfill}
          sx={{ alignSelf: 'flex-start' }}
        >
          {originalTitleBackfillTriggering ? <CircularProgress size={20} color="inherit" /> : t('triggers.originalTitleBackfill.trigger')}
        </Button>
      </Box>
    </Box>
  );
}
