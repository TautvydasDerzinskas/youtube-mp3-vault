import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, IconButton, Menu, ProgressBar, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Playlist } from '../../api/playlists';
import { isOfflineSyncComplete, useOfflineDownloads } from '../../offline/OfflineDownloadsContext';
import { displayName, formatBytes } from '../../utils/format';

interface PlaylistRowProps {
  playlist: Playlist;
  online: boolean;
  canGenerateSimilar: boolean;
  hasGeneratedPlaylist: boolean;
  isLockedBySource: boolean;
  onOpen: () => void;
  onPlayFirst: () => void;
  onSync: () => void;
  onRetryFailed: () => void;
  onScanHq: () => void;
  onTogglePause: () => void;
  onRename: () => void;
  onDelete: () => void;
  onGenerateSimilar: () => void;
}

// Mirrors frontend/src/pages/PlaylistsPage/PlaylistRow/{index,Info,Actions,Thumbnail}.tsx
// collapsed into one component — mobile rows never expand inline (see
// PlaylistsScreen), so there's no accordion/isSynced branch to replicate.
// Sync and Generate Similar both live in the "⋮" menu instead of being
// always-visible icons, since a standalone sync button plus the play button,
// thumbnail, and menu button don't leave much room for longer titles on a
// phone-width row.
export function PlaylistRow({
  playlist, online, canGenerateSimilar, hasGeneratedPlaylist, isLockedBySource,
  onOpen, onPlayFirst, onSync, onRetryFailed, onScanHq, onTogglePause, onRename, onDelete, onGenerateSimilar,
}: PlaylistRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const { isEnabled: isOfflineEnabled, progress: offlineProgressMap } = useOfflineDownloads();
  const offlineEnabled = isOfflineEnabled(playlist.id);
  const offlineComplete = isOfflineSyncComplete(offlineProgressMap[playlist.id]);

  const isRetrying = playlist.syncStatus === 'retrying';
  const isBusy = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || isRetrying;
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const isGenerated = playlist.youtubeId === null;
  const fullySynced = !isGenerated && playlist.videoCount > 0 && playlist.downloadedCount === playlist.videoCount;

  const showSync = !isGenerated && !playlist.syncPaused;
  const showRetry = !playlist.syncPaused && !isBusy && playlist.lastSyncedAt !== null && playlist.failedCount > 0;
  const showPauseToggle = !isGenerated && !isRetrying && (isBusy || playlist.syncPaused);
  const hasCompletedSync = !isBusy && playlist.lastSyncedAt !== null;
  const showGenerateSimilar = !isGenerated && hasCompletedSync && canGenerateSimilar && !hasGeneratedPlaylist;

  const renameDisabled = isPausing || isBusy || isLockedBySource;
  const syncDisabled = isBusy || !online || isLockedBySource;
  const deleteDisabled = isPausing || isBusy || isLockedBySource;
  const scanHqDisabled = isBusy || !online || isLockedBySource;

  const progress = playlist.videoCount > 0
    ? (playlist.downloadedCount + playlist.failedCount) / playlist.videoCount : 0;

  const closeMenu = () => setMenuVisible(false);

  return (
    <Pressable
      onPress={onOpen}
      style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
    >
      {isBusy ? (
        <View style={styles.playSlot}>
          <ActivityIndicator size={24} color={theme.colors.primary} />
        </View>
      ) : (
        <Pressable onPress={onPlayFirst} disabled={playlist.downloadedCount === 0} hitSlop={8} style={styles.playSlot}>
          <MaterialCommunityIcons
            name="play-circle"
            size={32}
            color={playlist.downloadedCount === 0 ? theme.colors.outlineVariant : theme.colors.primary}
          />
        </Pressable>
      )}

      <View style={styles.thumbWrap}>
        {playlist.thumbnailUrl ? (
          <Image source={{ uri: playlist.thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
            <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        {offlineEnabled && (
          <View style={styles.offlineBadge}>
            <MaterialCommunityIcons
              name="cloud-check-outline"
              size={16}
              color={offlineComplete ? '#2e7d32' : theme.colors.primary}
            />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>{displayName(playlist)}</Text>

        <View style={styles.chipRow}>
          {playlist.syncStatus === 'generating' ? (
            <Chip compact mode="flat" style={styles.chip}>{t('playlists.generatingChip')}</Chip>
          ) : isBusy ? (
            <Chip compact mode="flat" style={styles.chip}>{t('playlists.syncing')}</Chip>
          ) : isGenerated ? (
            <Chip compact mode="outlined" style={styles.chip}>{t('playlists.generatedBadge')}</Chip>
          ) : fullySynced ? (
            <Chip compact mode="flat" style={styles.chip}>
              {t('playlists.songsAndSize', { count: playlist.downloadedCount, size: formatBytes(playlist.totalSize) || '0 B' })}
            </Chip>
          ) : (
            <Chip compact mode="flat" style={styles.chip}>
              {t('playlists.downloadedCount', { count: playlist.downloadedCount, total: playlist.videoCount })}
            </Chip>
          )}
          {playlist.failedCount > 0 && !isGenerated && (
            <Chip compact mode="flat" style={[styles.chip, { backgroundColor: theme.colors.errorContainer }]}>
              {t('playlists.failedCount', { count: playlist.failedCount })}
            </Chip>
          )}
        </View>

        {isBusy && (
          <ProgressBar
            progress={playlist.syncPhase ? playlist.syncPhase.current / playlist.syncPhase.total : progress}
            style={styles.progress}
          />
        )}
      </View>

      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchor={
          <IconButton icon="dots-vertical" onPress={(e) => { e.stopPropagation(); setMenuVisible(true); }} />
        }
      >
        {showSync && (
          <Menu.Item leadingIcon="sync" disabled={syncDisabled} title={t('playlists.syncNow')}
            onPress={() => { closeMenu(); onSync(); }} />
        )}
        <Menu.Item leadingIcon="pencil-outline" disabled={renameDisabled} title={t('playlists.rename')}
          onPress={() => { closeMenu(); onRename(); }} />
        {showRetry && (
          <Menu.Item leadingIcon="reload" disabled={!online} title={t('playlists.retryFailed', { count: playlist.failedCount })}
            onPress={() => { closeMenu(); onRetryFailed(); }} />
        )}
        {showGenerateSimilar && (
          <Menu.Item leadingIcon="creation" title={t('playlists.generateSimilar')}
            onPress={() => { closeMenu(); onGenerateSimilar(); }} />
        )}
        <Menu.Item leadingIcon="quality-high" disabled={scanHqDisabled} title={t('playlists.scanHq')}
          onPress={() => { closeMenu(); onScanHq(); }} />
        {showPauseToggle && (
          <Menu.Item
            leadingIcon={playlist.syncPaused ? 'play-circle-outline' : 'pause-circle-outline'}
            disabled={isPausing || !online}
            title={playlist.syncPaused ? t('playlists.resumeSync') : t('playlists.pauseSync')}
            onPress={() => { closeMenu(); onTogglePause(); }}
          />
        )}
        <Menu.Item leadingIcon="delete-outline" disabled={deleteDisabled} title={t('playlists.remove')}
          onPress={() => { closeMenu(); onDelete(); }} />
      </Menu>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  playSlot: { alignItems: 'center', justifyContent: 'center', width: 32, height: 32 },
  thumbWrap: { width: 48, height: 36, position: 'relative' },
  thumb: { width: 48, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  offlineBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
  },
  info: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { minHeight: 24 },
  progress: { height: 3, borderRadius: 2, marginTop: 2 },
});
