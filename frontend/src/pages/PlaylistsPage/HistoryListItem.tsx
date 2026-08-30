import { useEffect, useState } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Avatar, Stack } from '@mui/material';
import { History as HistoryIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist, playlistsApi } from '../../api/youtube';
import { formatBytes, formatPlaybackTime } from './utils';

interface HistoryListItemProps {
  // Same refetch-on-change contract as AllTracksListItem — see its own doc
  // comment for why `playlists` (rather than some history-specific event) is
  // what's watched here too.
  refreshOn: Playlist[];
}

// Fixed entry pointing at /history, styled identically to AllTracksListItem
// (same Paper/Avatar/Chip layout) — not a real playlist either, so the same
// "no rename/delete/sync" reasoning applies. Same "hide only while the
// summary hasn't loaded yet" contract as AllTracksListItem — still shown
// (just with a "0 tracks" chip) for a user who hasn't played anything yet,
// rather than disappearing entirely, so it's a stable, always-findable entry
// point into /history.
export function HistoryListItem({ refreshOn }: HistoryListItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<{ songCount: number; totalDurationSec: number; totalSize: number } | null>(null);

  useEffect(() => {
    playlistsApi.getHistorySummary().then(setSummary).catch(() => {});
  }, [refreshOn]);

  if (!summary) return null;

  const open = () => navigate('/history');

  return (
    <Paper onClick={open} elevation={0}
      sx={{ mb: 1, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
        borderRadius: '8px', transition: 'background-color 0.2s',
        '&:hover': { bgcolor: 'action.hover' } }}>
      <Avatar variant="rounded" sx={{ width: 56, height: 40, borderRadius: 1, flexShrink: 0 }}>
        <HistoryIcon />
      </Avatar>

      <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {t('playlists.history.title')}
        </Typography>

        {summary.totalDurationSec > 0 && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {formatPlaybackTime(summary.totalDurationSec, t)}
          </Typography>
        )}
      </Box>

      <Stack direction="row" gap={1} alignItems="center" justifyContent="flex-end" flexWrap="wrap" sx={{ flexShrink: 0 }}>
        <Chip label={t('playlists.detail.trackCount', { count: summary.songCount })}
          size="small" sx={{ fontSize: 11, bgcolor: 'divider', color: 'common.white' }} />
        {summary.totalSize > 0 && (
          <Chip label={formatBytes(summary.totalSize)} size="small" sx={{ fontSize: 11, bgcolor: 'divider', color: 'common.white' }} />
        )}
      </Stack>

      <Tooltip title={t('playlists.openPlaylist')}>
        <IconButton size="small" onClick={e => { e.stopPropagation(); open(); }}>
          <ChevronRightIcon />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}
