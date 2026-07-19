import { Box, Typography, Chip, Stack, Tooltip, LinearProgress } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { displayName, formatBytes, timeAgo } from '../utils';

interface InfoProps {
  playlist: Playlist;
  isBusy: boolean;
  isPausing: boolean;
  expanded: boolean;
}

export function Info({ playlist, isBusy, isPausing, expanded }: InfoProps) {
  const { t } = useTranslation();
  // Failed videos are done being processed too (just unsuccessfully) — count
  // them toward progress so the bar doesn't stall short of 100% while a sync
  // with some failures is otherwise finished.
  const progress = playlist.videoCount > 0
    ? Math.round(((playlist.downloadedCount + playlist.failedCount) / playlist.videoCount) * 100) : 0;

  return (
    <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        <Typography variant="subtitle2" fontWeight={600} noWrap sx={{ minWidth: 0 }}>{displayName(playlist)}</Typography>
        {playlist.syncStatus === 'error' && (
          <Tooltip title={t('playlists.lastSyncFailed')}><ErrorOutline sx={{ fontSize: 14, color: 'error.main' }} /></Tooltip>
        )}
        {playlist.syncPaused && (
          <Tooltip title={isPausing ? t('playlists.pausingTooltip') : t('playlists.syncPausedTooltip')}>
            <Chip label={isPausing ? t('playlists.pausingChip') : t('playlists.pausedChip')} size="small" color={isPausing ? 'warning' : 'default'}
              sx={{ fontSize: 10, height: 18 }} />
          </Tooltip>
        )}
      </Stack>

      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
        {isBusy ? (
          <Chip label={t('playlists.syncing')} size="small" color="info" sx={{ fontSize: 11 }} />
        ) : (
          <Chip label={t('playlists.downloadedCount', { count: playlist.downloadedCount, total: playlist.videoCount })}
            size="small" color={playlist.downloadedCount === playlist.videoCount && playlist.videoCount > 0 ? 'success' : 'default'}
            sx={{ fontSize: 11 }} />
        )}
        {playlist.failedCount > 0 && (
          <Chip label={t('playlists.failedCount', { count: playlist.failedCount })} size="small" color="error" sx={{ fontSize: 11 }} />
        )}
        {playlist.totalSize > 0 && (
          <Chip label={formatBytes(playlist.totalSize)} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        )}
        {!isBusy && (
          playlist.lastSyncedAt ? (
            <Typography variant="caption" color="text.secondary">
              {t('playlists.syncedAgo', { time: timeAgo(playlist.lastSyncedAt, t) })}
            </Typography>
          ) : (
            <Chip label={t('playlists.notSynced')} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          )
        )}
      </Stack>

      {isPausing ? (
        <Typography variant="caption" color="warning.main" noWrap component="div" sx={{ mt: 0.25 }}>
          {playlist.currentVideo
            ? t('playlists.pausingMessage', { title: playlist.currentVideo.title })
            : t('playlists.pausingMessageGeneric')}
        </Typography>
      ) : (
        isBusy && !expanded && playlist.currentVideo && (
          <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ mt: 0.25 }}>
            {t('playlists.syncingMessage', {
              position: playlist.currentVideo.position, total: playlist.videoCount, title: playlist.currentVideo.title,
            })}
          </Typography>
        )
      )}

      {isBusy && <LinearProgress variant="determinate" value={progress} sx={{ mt: 0.5, height: 3, borderRadius: 2 }} />}
    </Box>
  );
}
