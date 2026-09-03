import { Chip, Stack, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../../api/youtube';
import { formatBytes, timeAgo } from '../utils';

interface StatusChipsProps {
  playlist: Playlist;
  isBusy: boolean;
}

// The playlist row's sync-status/track-count/size chip cluster — split out
// of Info so PlaylistRow can place it in its own column on the right of the
// row, vertically centered against the title/info-text column (via the
// row's own alignItems: 'center') instead of stacked underneath it.
export function StatusChips({ playlist, isBusy }: StatusChipsProps) {
  const { t } = useTranslation();
  const isGenerated = playlist.origin === 'generated';
  const isCreated = playlist.origin === 'created';
  const fullySynced = playlist.origin === 'imported' && playlist.videoCount > 0 && playlist.downloadedCount === playlist.videoCount;

  return (
    <Stack direction="row" gap={1} alignItems="center" justifyContent="flex-end" flexWrap="wrap" sx={{ flexShrink: 0 }}>
      {playlist.syncStatus === 'generating' ? (
        <Chip label={t('playlists.generatingChip')} size="small" color="info" sx={{ fontSize: 11 }} />
      ) : playlist.syncStatus === 'creating' ? (
        <Chip label={t('playlists.creatingChip')} size="small" color="info" sx={{ fontSize: 11 }} />
      ) : isBusy ? (
        <>
          <Chip label={
              playlist.syncPhase?.phase === 'quality' ? t('playlists.videoList.searchingHq')
              : playlist.syncStatus === 'scanning_hq' ? t('playlists.scanningHq')
              : t('playlists.syncing')
            }
            size="small" sx={{ fontSize: 11, bgcolor: 'common.black', color: 'common.white' }} />
          {playlist.syncPhase?.phase === 'quality' && playlist.syncPhase.hqFoundIds.length > 0 && (
            <Chip label={t('playlists.hqFoundSoFar', { count: playlist.syncPhase.hqFoundIds.length })}
              size="small" sx={{ fontSize: 11, bgcolor: 'hq.main', color: 'hq.contrastText' }} />
          )}
        </>
      ) : (
        <>
          {isGenerated ? (
            <Chip label={t('playlists.generatedBadge')} size="small" color="secondary" sx={{ fontSize: 11 }} />
          ) : isCreated ? (
            <Chip label={t('playlists.createdBadge')} size="small" color="primary" sx={{ fontSize: 11 }} />
          ) : fullySynced ? (
            <Tooltip title={playlist.lastSyncedAt ? t('playlists.syncedAgo', { time: timeAgo(playlist.lastSyncedAt, t) }) : ''}>
              <Chip
                label={t('playlists.syncedBadge')}
                size="small"
                sx={{ fontSize: 11, bgcolor: 'hq.main', color: 'hq.contrastText' }}
              />
            </Tooltip>
          ) : (
            <Chip label={t('playlists.downloadedCount', { count: playlist.downloadedCount, total: playlist.videoCount })}
              size="small" sx={{ fontSize: 11 }} />
          )}
          <Chip label={t('playlists.detail.trackCount', { count: playlist.videoCount })} size="small"
            sx={{ fontSize: 11, bgcolor: 'divider', color: 'common.white' }} />
        </>
      )}
      {/* Generated playlists auto-drop failed/unusable candidates on their
          own (see audioAnalysisWorker.ts/playlistGenerator.ts) — there's
          never anything for the user to act on, so don't show this. */}
      {playlist.failedCount > 0 && !isGenerated && (
        <Chip label={t('playlists.failedCount', { count: playlist.failedCount })} size="small" color="error" sx={{ fontSize: 11 }} />
      )}
      {playlist.totalSize > 0 && (
        <Chip label={formatBytes(playlist.totalSize)} size="small" sx={{ fontSize: 11, bgcolor: 'divider', color: 'common.white' }} />
      )}
      {!isBusy && playlist.origin === 'imported' && !playlist.lastSyncedAt && (
        <Chip label={t('playlists.notSynced')} size="small" sx={{ fontSize: 11, bgcolor: 'divider', color: 'common.white' }} />
      )}
    </Stack>
  );
}
