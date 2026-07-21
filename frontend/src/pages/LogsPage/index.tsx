import { useEffect, useState } from 'react';
import {
  Box, Typography, TextField, MenuItem, Alert, CircularProgress, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Paper, Chip,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, AdminUser, LogEntry, LogAction } from '../../api/admin';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function endOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

const ACTION_COLORS: Record<LogAction, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  playlist_imported: 'success',
  playlist_renamed: 'default',
  playlist_deleted: 'error',
  playlist_synced: 'primary',
  playlist_sync_paused: 'warning',
  generated_playlist_created: 'success',
  generated_playlist_renamed: 'default',
  generated_playlist_deleted: 'error',
  user_logged_in_web: 'success',
  user_logged_in_mobile: 'success',
  user_logged_out_web: 'default',
  user_logged_out_mobile: 'default',
};

export default function LogsPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [fromDate, setFromDate] = useState(() => toDateInput(new Date(Date.now() - 7 * MS_PER_DAY)));
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));
  const [logs, setLogs] = useState<LogEntry[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  useEffect(() => {
    setLogs('loading');
    adminApi.listLogs({
      userId: selectedUserId || undefined,
      from: fromDate ? startOfDay(fromDate) : undefined,
      to: toDate ? endOfDay(toDate) : undefined,
    })
      .then(setLogs)
      .catch(() => setLogs('error'));
  }, [selectedUserId, fromDate, toDate]);

  function formatDetails(log: LogEntry): string {
    const d = log.details as Record<string, any>;
    switch (log.action) {
      case 'playlist_imported':
        return t('logs.detailText.playlistImported', { name: d.name, songCount: d.songCount });
      case 'playlist_renamed':
      case 'generated_playlist_renamed':
        return t('logs.detailText.renamed', { oldName: d.oldName, newName: d.newName });
      case 'playlist_deleted':
      case 'generated_playlist_deleted':
        return t('logs.detailText.deleted', {
          name: d.name, songCount: d.songCount, downloadedCount: d.downloadedCount, failedCount: d.failedCount,
        });
      case 'playlist_synced':
        return t('logs.detailText.synced', {
          name: d.name, downloadedCount: d.downloadedCount, songCount: d.songCount, failedCount: d.failedCount,
        });
      case 'playlist_sync_paused':
        return t('logs.detailText.syncPaused', { name: d.name });
      case 'generated_playlist_created':
        return t('logs.detailText.generatedCreated', {
          name: d.name, sourceName: d.sourceName, songCount: d.songCount, failedCount: d.failedCount,
        });
      case 'user_logged_in_web':
      case 'user_logged_in_mobile':
        return t('logs.detailText.loggedIn', { email: d.email });
      case 'user_logged_out_web':
      case 'user_logged_out_mobile':
        return t('logs.detailText.loggedOut');
      default:
        return JSON.stringify(d);
    }
  }

  if (users === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (users === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('logs.loadUsersError')}</Alert>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>{t('logs.title')}</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          select
          label={t('logs.selectUser')}
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">{t('logs.allUsers')}</MenuItem>
          {users.map(u => (
            <MenuItem key={u.id} value={u.id}>{u.displayName} ({u.email})</MenuItem>
          ))}
        </TextField>

        <TextField
          type="date"
          label={t('logs.from')}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          label={t('logs.to')}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>

      {logs === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      )}
      {logs === 'error' && (
        <Alert severity="error">{t('logs.loadLogsError')}</Alert>
      )}
      {Array.isArray(logs) && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('logs.date')}</TableCell>
                <TableCell>{t('logs.user')}</TableCell>
                <TableCell>{t('logs.action')}</TableCell>
                <TableCell>{t('logs.details')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      {t('logs.empty')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {logs.map(log => (
                <TableRow key={log.id} hover>
                  <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{log.userDisplayName} ({log.userEmail})</TableCell>
                  <TableCell>
                    <Chip
                      label={t(`logs.actions.${log.action}`)}
                      size="small"
                      color={ACTION_COLORS[log.action]}
                      variant={ACTION_COLORS[log.action] === 'default' ? 'outlined' : 'filled'}
                    />
                  </TableCell>
                  <TableCell>{formatDetails(log)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
