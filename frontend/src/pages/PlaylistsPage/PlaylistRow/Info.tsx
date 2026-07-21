import { Box, Typography, Chip, Stack, Tooltip, LinearProgress, Link } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { displayName, formatBytes, formatPlaybackTime, timeAgo, youtubePlaylistUrl } from '../utils';

interface InfoProps {
  playlist: Playlist;
  isBusy: boolean;
  isPausing: boolean;
  expanded: boolean;
}

export function Info({ playlist, isBusy, isPausing, expanded }: InfoProps) {
  const { t } = useTranslation();
  const progress = playlist.videoCount > 0
    ? Math.round(((playlist.downloadedCount + playlist.failedCount) / playlist.videoCount) * 100) : 0;
  // A generated playlist has no YouTube playlist behind it — that's the one
  // authoritative signal (unlike sourcePlaylistId, which goes null if the
  // source is later deleted, even though this is still very much a
  // generated playlist with nothing to sync from).
  const isGenerated = playlist.youtubeId === null;
  const fullySynced = !isGenerated && playlist.videoCount > 0 && playlist.downloadedCount === playlist.videoCount;

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

      {playlist.totalDurationSec > 0 && (
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {formatPlaybackTime(playlist.totalDurationSec, t)}
          {isGenerated && playlist.sourcePlaylistName && (
            <> · {t('playlists.generatedFrom', { name: playlist.sourcePlaylistName })}</>
          )}
          {!isGenerated && playlist.youtubeId && (
            <>
              {' · '}{t('playlists.importedFromPrefix')}{' '}
              <Link
                href={youtubePlaylistUrl(playlist.youtubeId)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                color="inherit"
              >
                {t('playlists.importedFromLinkText')}
              </Link>
            </>
          )}
        </Typography>
      )}

      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
        {playlist.syncStatus === 'generating' ? (
          <Chip label={t('playlists.generatingChip')} size="small" color="info" sx={{ fontSize: 11 }} />
        ) : isBusy ? (
          <Chip label={t('playlists.syncing')} size="small" color="info" sx={{ fontSize: 11 }} />
        ) : (
          <>
            {isGenerated ? (
              <Chip label={t('playlists.generatedBadge')} size="small" variant="outlined" color="secondary" sx={{ fontSize: 11 }} />
            ) : fullySynced ? (
              <Chip label={t('playlists.allSynced')} size="small" color="success" sx={{ fontSize: 11 }} />
            ) : (
              <Chip label={t('playlists.downloadedCount', { count: playlist.downloadedCount, total: playlist.videoCount })}
                size="small" sx={{ fontSize: 11 }} />
            )}
            <Chip label={t('playlists.detail.trackCount', { count: playlist.videoCount })} size="small" variant="outlined" sx={{ fontSize: 11 }} />
          </>
        )}
        {/* Generated playlists auto-drop failed/unusable candidates on their
            own (see audioAnalysisWorker.ts/playlistGenerator.ts) — there's
            never anything for the user to act on, so don't show this. */}
        {playlist.failedCount > 0 && !isGenerated && (
          <Chip label={t('playlists.failedCount', { count: playlist.failedCount })} size="small" color="error" sx={{ fontSize: 11 }} />
        )}
        {playlist.totalSize > 0 && (
          <Chip label={formatBytes(playlist.totalSize)} size="small" variant="outlined" sx={{ fontSize: 11 }} />
        )}
        {!isBusy && !isGenerated && (
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

      {isBusy && (
        playlist.videoCount > 0
          ? <LinearProgress variant="determinate" value={progress} sx={{ mt: 0.5, height: 3, borderRadius: 2 }} />
          // No real denominator yet (e.g. a generated playlist still
          // discovering candidates) — an indeterminate bar just signals
          // "something is happening" instead of looking stuck at 0%.
          : <LinearProgress variant="indeterminate" sx={{ mt: 0.5, height: 3, borderRadius: 2 }} />
      )}
    </Box>
  );
}
