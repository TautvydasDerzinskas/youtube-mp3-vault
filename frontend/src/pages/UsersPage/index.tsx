import { useEffect, useState } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Paper, Chip, IconButton, Tooltip,
} from '@mui/material';
import {
  Block as BanIcon, CheckCircle as UnbanIcon, Visibility as ViewIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { adminApi, AdminUser } from '../../api/admin';
import { UserDetailDialog } from './UserDetailDialog';

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const load = () => {
    setUsers('loading');
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  };

  useEffect(load, []);

  const handleToggleBan = async (user: AdminUser) => {
    setActioningId(user.id);
    try {
      const updated = user.isBanned ? await adminApi.unbanUser(user.id) : await adminApi.banUser(user.id);
      setUsers(prev => (Array.isArray(prev) ? prev.map(u => (u.id === updated.id ? updated : u)) : prev));
    } finally {
      setActioningId(null);
    }
  };

  if (users === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (users === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('users.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>{t('users.title')}</Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('users.email')}</TableCell>
              <TableCell>{t('users.displayName')}</TableCell>
              <TableCell>{t('users.verified')}</TableCell>
              <TableCell>{t('users.admin')}</TableCell>
              <TableCell>{t('users.status')}</TableCell>
              <TableCell align="right">{t('users.playlists')}</TableCell>
              <TableCell>{t('users.created')}</TableCell>
              <TableCell align="right">{t('users.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id} hover>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>
                  {user.emailVerified
                    ? <Chip label={t('users.verifiedYes')} size="small" color="success" />
                    : <Chip label={t('users.verifiedNo')} size="small" variant="outlined" />}
                </TableCell>
                <TableCell>
                  {user.isAdmin && <Chip label={t('users.adminYes')} size="small" color="primary" />}
                </TableCell>
                <TableCell>
                  {user.isBanned
                    ? <Chip label={t('users.banned')} size="small" color="error" />
                    : <Chip label={t('users.active')} size="small" variant="outlined" />}
                </TableCell>
                <TableCell align="right">{user.playlistCount}</TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="right">
                  <Tooltip title={t('users.viewDetails')}>
                    <IconButton size="small" onClick={() => setDetailUserId(user.id)}>
                      <ViewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={user.isBanned ? t('users.unban') : t('users.ban')}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={actioningId === user.id}
                        onClick={() => handleToggleBan(user)}
                        sx={{ color: user.isBanned ? 'success.main' : 'error.main' }}
                      >
                        {user.isBanned ? <UnbanIcon fontSize="small" /> : <BanIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {detailUserId && (
        <UserDetailDialog userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </Box>
  );
}
