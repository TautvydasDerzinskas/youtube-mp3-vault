import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, IconButton, Menu, ProgressBar, Text, Tooltip, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Playlist } from '../../api/playlists';
import { displayName } from '../../utils/format';

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
// Sync stays a directly-visible icon like web; Generate Similar moves into
// the "⋮" menu instead of also being a second always-visible icon, since
// three icon buttons plus the play button and thumbnail don't comfortably
// fit a phone-width row the way they fit a desktop one.
export function PlaylistRow({
  playlist, online, canGenerateSimilar, hasGeneratedPlaylist, isLockedBySource,
  onOpen, onPlayFirst, onSync, onRetryFailed, onScanHq, onTogglePause, onRename, onDelete, onGenerateSimilar,
}: PlaylistRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);

  const isRetrying = playlist.syncStatus === 'retrying';
  const isBusy = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || isRetrying;
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const isGenerated = playlist.youtubeId === null;

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
      <Pressable onPress={onPlayFirst} disabled={playlist.downloadedCount === 0} hitSlop={8}>
        <MaterialCommunityIcons
          name="play-circle"
          size={32}
          color={playlist.downloadedCount === 0 ? theme.colors.outlineVariant : theme.colors.primary}
        />
      </Pressable>

      {playlist.thumbnailUrl ? (
        <Image source={{ uri: playlist.thumbnailUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
          <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
        </View>
      )}

      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>{displayName(playlist)}</Text>

        <View style={styles.chipRow}>
          {playlist.syncStatus === 'generating' ? (
            <Chip compact mode="flat" style={styles.chip}>{t('playlists.generatingChip')}</Chip>
          ) : isBusy ? (
            <Chip compact mode="flat" style={styles.chip}>{t('playlists.syncing')}</Chip>
          ) : isGenerated ? (
            <Chip compact mode="outlined" style={styles.chip}>{t('playlists.generatedBadge')}</Chip>
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

      {showSync && (
        <Tooltip title={t('playlists.syncNow')}>
          <IconButton
            icon={() => isBusy
              ? <ActivityIndicator size={20} color={theme.colors.primary} />
              : <MaterialCommunityIcons name="sync" size={20} color={theme.colors.primary} />}
            disabled={syncDisabled}
            onPress={(e) => { e.stopPropagation(); onSync(); }}
          />
        </Tooltip>
      )}

      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchor={
          <IconButton icon="dots-vertical" onPress={(e) => { e.stopPropagation(); setMenuVisible(true); }} />
        }
      >
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
  thumb: { width: 48, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { height: 24 },
  progress: { height: 3, borderRadius: 2, marginTop: 2 },
});
