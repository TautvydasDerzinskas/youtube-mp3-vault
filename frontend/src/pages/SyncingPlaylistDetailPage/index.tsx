import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip, CircularProgress, Alert, List, LinearProgress } from '@mui/material';
import { MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePlayer } from '../../contexts/PlayerContext';
import { useSyncingPlaylistDetail } from './hooks/useSyncingPlaylistDetail';
import { TrackRow } from '../PlaylistsPage/TrackRow';
import { displayName, formatBytes } from '../PlaylistsPage/utils';

// The dedicated "this playlist is busy right now" view — separate from
// PlaylistDetailPage on purpose, so that page's sort/filter/search logic
// never has to account for rows changing under the user mid-interaction.
// No sort/filter/search controls here at all: tracks appear strictly in the
// order the backend actually finished with them (see SyncPhase.processedIds
// in syncService.ts), newest on top, growing downward as the pass continues
// — a live feed, not a browsable table. Redirects to the normal detail page
// automatically once the sync/scan finishes (see the hook).
export default function SyncingPlaylistDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { playlistId, playlist, videos } = useSyncingPlaylistDetail();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  if (!playlistId) return <Navigate to="/playlists" replace />;

  if (playlist === 'loading' || videos === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }
  if (playlist === 'error' || videos === 'error') {
    return <Alert severity="error" sx={{ m: 3 }}>{t('playlists.detail.failedToLoad')}</Alert>;
  }

  const phase = playlist.syncPhase;
  const hqFoundSet = new Set(phase?.hqFoundIds ?? []);

  // No syncPhase yet means the raw download step is still running (metadata/
  // quality only start once every video is downloaded) — position order is
  // still the processing order there, so "already resolved" is just derived
  // straight from each row's own terminal downloadStatus.
  const processedIds = phase
    ? phase.processedIds
    : videos
      .filter(v => v.downloadStatus === 'done' || v.downloadStatus === 'failed' || v.downloadStatus === 'removed')
      .sort((a, b) => a.position - b.position)
      .map(v => v.id);
  const videoMap = new Map(videos.map(v => [v.id, v]));
  const orderedProcessed = [...processedIds].reverse();

  const progressMessage = playlist.syncPaused
    ? (playlist.currentVideo
      ? t('playlists.pausingMessage', { title: playlist.currentVideo.title })
      : t('playlists.pausingMessageGeneric'))
    : phase
    ? t(phase.phase === 'metadata' ? 'playlists.metadataPhaseMessage' : 'playlists.qualityPhaseMessage',
      { current: phase.current, total: phase.total, title: phase.title })
    : playlist.isPacing
    ? t('playlists.pacingMessage')
    : playlist.currentVideo
    ? t('playlists.syncingMessage', {
      position: playlist.downloadedCount + playlist.failedCount + 1, total: playlist.videoCount, title: playlist.currentVideo.title,
    })
    : t('playlists.syncingPage.starting');

  return (
    <Box sx={{ p: 3 }}>
      <Tooltip title={t('playlists.detail.back')}>
        <IconButton onClick={() => navigate('/playlists')} sx={{ mb: 1, ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Avatar src={playlist.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 96, height: 72, borderRadius: 2, flexShrink: 0 }}>
          <MusicNoteIcon sx={{ fontSize: 32 }} />
        </Avatar>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>{displayName(playlist)}</Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip size="small" variant="outlined" label={t('playlists.detail.trackCount', { count: playlist.videoCount })} />
            {playlist.totalSize > 0 && <Chip size="small" variant="outlined" label={formatBytes(playlist.totalSize)} />}
          </Stack>
        </Box>
      </Box>

      <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px' }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
          <Chip label={playlist.syncStatus === 'generating' ? t('playlists.generatingChip') : t('playlists.syncing')}
            size="small" color="info" />
          {phase?.phase === 'quality' && hqFoundSet.size > 0 && (
            <Chip label={t('playlists.hqFoundSoFar', { count: hqFoundSet.size })} size="small" color="success" variant="outlined" />
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" noWrap>{progressMessage}</Typography>
        {phase ? (
          <LinearProgress variant="determinate" color="secondary"
            value={Math.round((phase.current / phase.total) * 100)} sx={{ mt: 1, height: 4, borderRadius: 2 }} />
        ) : playlist.videoCount > 0 ? (
          <LinearProgress variant="determinate"
            value={Math.round(((playlist.downloadedCount + playlist.failedCount) / playlist.videoCount) * 100)}
            sx={{ mt: 1, height: 4, borderRadius: 2 }} />
        ) : (
          <LinearProgress variant="indeterminate" sx={{ mt: 1, height: 4, borderRadius: 2 }} />
        )}
      </Box>

      {orderedProcessed.length === 0 ? (
        <Typography color="text.secondary">{t('playlists.syncingPage.waiting')}</Typography>
      ) : (
        <List dense disablePadding>
          {orderedProcessed.map(id => {
            const video = videoMap.get(id);
            if (!video) return null;
            const isCurrentTrack = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === video.id;
            return (
              <TrackRow key={video.id} playlistId={playlistId} video={video} isCurrentTrack={isCurrentTrack}
                isAudioPlaying={isAudioPlaying} onTogglePlay={() => handleTogglePlay(playlistId, video)}
                sx={hqFoundSet.has(video.id) ? { bgcolor: 'rgba(76, 175, 80, 0.18)' } : undefined} />
            );
          })}
        </List>
      )}
    </Box>
  );
}
