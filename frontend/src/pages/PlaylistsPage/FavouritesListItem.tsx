import { useEffect, useState } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Avatar, Stack } from '@mui/material';
import { Favorite as FavoriteIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist, playlistsApi } from '../../api/youtube';
import { formatBytes, formatPlaybackTime } from './utils';

interface FavouritesListItemProps {
  // Same refetch-on-change contract as AllTracksListItem/HistoryListItem —
  // see AllTracksListItem's own doc comment for why `playlists` (rather than
  // some favourites-specific event) is what's watched here too.
  refreshOn: Playlist[];
}

// Fixed entry pointing into All Tracks pre-filtered to favourites, styled
// identically to AllTracksListItem/HistoryListItem (same Paper/Avatar/Chip
// layout) — not a real playlist either, so the same "no rename/delete/sync"
// reasoning applies. Same "hide only while the summary hasn't loaded yet"
// contract as the other two — still shown (just with a "0 tracks" chip) for
// a user who hasn't favourited anything yet.
export function FavouritesListItem({ refreshOn }: FavouritesListItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<{ songCount: number; totalDurationSec: number; totalSize: number } | null>(null);

  useEffect(() => {
    playlistsApi.getFavouritesSummary().then(setSummary).catch(() => {});
  }, [refreshOn]);

  if (!summary) return null;

  // The favourites filter lives on the All Tracks page itself (see
  // TrackFilterBar's favourite Select) rather than a dedicated page — this
  // just opens into it pre-filtered via the same `fav` URL param.
  const open = () => navigate('/all-tracks?fav=favourite');

  return (
    <Paper onClick={open} elevation={0}
      sx={{ mb: 1, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
        borderRadius: '8px', transition: 'background-color 0.2s',
        '&:hover': { bgcolor: 'action.hover' } }}>
      <Avatar variant="rounded" sx={{ width: 56, height: 40, borderRadius: 1, flexShrink: 0 }}>
        <FavoriteIcon />
      </Avatar>

      <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {t('playlists.favourites.title')}
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
