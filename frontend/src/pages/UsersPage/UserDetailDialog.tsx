import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Chip, Stack, Divider, List, ListItem, ListItemText, CircularProgress, Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, AdminUser } from '../../api/admin';
import { Playlist } from '../../api/youtube';
import { displayName, formatBytes, timeAgo } from '../PlaylistsPage/utils';

interface UserDetailDialogProps {
  userId: string;
  onClose: () => void;
}

export function UserDetailDialog({ userId, onClose }: UserDetailDialogProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ user: AdminUser; playlists: Playlist[] } | 'loading' | 'error'>('loading');

  useEffect(() => {
    setData('loading');
    adminApi.getUser(userId).then(setData).catch(() => setData('error'));
  }, [userId]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('users.detailsTitle')}</DialogTitle>
      <DialogContent dividers>
        {data === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {data === 'error' && <Alert severity="error">{t('users.failedToLoad')}</Alert>}
        {data !== 'loading' && data !== 'error' && (
          <>
            <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
              {data.user.isAdmin && <Chip label={t('users.adminYes')} size="small" color="primary" />}
              <Chip
                label={data.user.emailVerified ? t('users.verifiedYes') : t('users.verifiedNo')}
                size="small" color={data.user.emailVerified ? 'success' : 'default'}
                variant={data.user.emailVerified ? 'filled' : 'outlined'}
              />
              <Chip
                label={data.user.isBanned ? t('users.banned') : t('users.active')}
                size="small" color={data.user.isBanned ? 'error' : 'default'}
                variant={data.user.isBanned ? 'filled' : 'outlined'}
              />
            </Stack>

            <Typography variant="body2" color="text.secondary">{t('users.email')}</Typography>
            <Typography variant="body1" mb={1.5}>{data.user.email}</Typography>

            <Typography variant="body2" color="text.secondary">{t('users.displayName')}</Typography>
            <Typography variant="body1" mb={1.5}>{data.user.displayName}</Typography>

            <Typography variant="body2" color="text.secondary">{t('users.created')}</Typography>
            <Typography variant="body1" mb={1.5}>{new Date(data.user.createdAt).toLocaleString()}</Typography>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" fontWeight={600} mb={1}>
              {t('users.playlistsTitle', { count: data.playlists.length })}
            </Typography>
            {data.playlists.length === 0 ? (
              <Typography color="text.secondary">{t('users.noPlaylists')}</Typography>
            ) : (
              <List dense disablePadding>
                {data.playlists.map(p => (
                  <ListItem key={p.id} disableGutters>
                    <ListItemText
                      primary={displayName(p)}
                      secondary={
                        <>
                          {t('playlists.downloadedCount', { count: p.downloadedCount, total: p.videoCount })}
                          {p.totalSize > 0 ? ` · ${formatBytes(p.totalSize)}` : ''}
                          {p.failedCount > 0 ? ` · ${t('playlists.failedCount', { count: p.failedCount })}` : ''}
                          {` · ${t('playlists.syncedAgo', { time: timeAgo(p.lastSyncedAt, t) })}`}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
