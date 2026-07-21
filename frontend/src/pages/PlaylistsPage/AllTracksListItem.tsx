import { useEffect, useState } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Avatar } from '@mui/material';
import { MusicNote as MusicNoteIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist, playlistsApi } from '../../api/youtube';
import { formatPlaybackTime } from './utils';

interface AllTracksListItemProps {
  // Re-fetches the summary whenever this changes. Passing the same
  // `playlists` array usePlaylists() already tracks (a fresh reference on
  // every add/delete/rename and every sync-polling tick) keeps this row in
  // sync with exactly the same events that update the real rows above it,
  // instead of only ever reflecting a stale snapshot from mount.
  refreshOn: Playlist[];
}

// A fixed, always-present entry pointing at /all-tracks — not a real
// playlist, so no rename/delete/sync actions and no sync-status chips
// ("synced X/Y", "last synced…") apply here at all; only the track count and
// total playback time, same as the real rows show once idle.
export function AllTracksListItem({ refreshOn }: AllTracksListItemProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<{ songCount: number; totalDurationSec: number } | null>(null);

  useEffect(() => {
    playlistsApi.getAllTracksSummary().then(setSummary).catch(() => {});
  }, [refreshOn]);

  if (!summary) return null;

  const open = () => navigate('/all-tracks');

  return (
    <Paper onClick={open} elevation={0}
      sx={{ mb: 1, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
        border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
        '&:hover': { borderColor: 'primary.dark' } }}>
      <Avatar variant="rounded" sx={{ width: 56, height: 40, borderRadius: 1, flexShrink: 0 }}>
        <MusicNoteIcon />
      </Avatar>

      <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {t('playlists.allTracks.title')}
        </Typography>

        {summary.totalDurationSec > 0 && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {formatPlaybackTime(summary.totalDurationSec, t)} · {t('playlists.allTracks.sourcedFromYoutube')}
          </Typography>
        )}

        <Chip label={t('playlists.detail.trackCount', { count: summary.songCount })}
          size="small" variant="outlined" sx={{ fontSize: 11, mt: 0.5 }} />
      </Box>

      <Tooltip title={t('playlists.openPlaylist')}>
        <IconButton size="small" onClick={e => { e.stopPropagation(); open(); }}>
          <ChevronRightIcon />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}
