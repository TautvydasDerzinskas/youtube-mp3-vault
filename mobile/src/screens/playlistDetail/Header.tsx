import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Chip, ProgressBar, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Playlist } from '../../api/playlists';
import { displayName, formatBytes } from '../../utils/format';

interface HeaderProps {
  playlist: Playlist;
  canPlayFirst: boolean;
  onPlayFirst: () => void;
}

// Mirrors frontend/src/pages/PlaylistDetailPage/Header.tsx (thumbnail,
// play-first button, track-count/size chips), plus a sync-status section
// web doesn't have here at all — this is mobile's answer to "where do
// syncing details go, given expanding a row is awkward on a phone": rather
// than a separate in-progress screen/dialog, the detail screen itself
// (reached by tapping any row, busy or not) shows this banner up top when
// relevant, right above the same track list.
export function Header({ playlist, canPlayFirst, onPlayFirst }: HeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const isBusy = playlist.syncStatus === 'syncing' || playlist.syncStatus === 'generating' || playlist.syncStatus === 'retrying';
  const isPausing = playlist.syncPaused && playlist.syncStatus === 'syncing';
  const progress = playlist.videoCount > 0 ? (playlist.downloadedCount + playlist.failedCount) / playlist.videoCount : 0;

  const statusMessage = isPausing
    ? (playlist.currentVideo ? t('playlists.pausingMessage', { title: playlist.currentVideo.title }) : t('playlists.pausingMessageGeneric'))
    : playlist.syncPhase
    ? t(playlist.syncPhase.phase === 'metadata' ? 'playlists.metadataPhaseMessage' : 'playlists.qualityPhaseMessage', {
        current: playlist.syncPhase.current, total: playlist.syncPhase.total, title: playlist.syncPhase.title,
      })
    : playlist.isPacing
    ? t('playlists.pacingMessage')
    : playlist.currentVideo
    ? t('playlists.syncingMessage', {
        position: playlist.downloadedCount + playlist.failedCount + 1, total: playlist.videoCount, title: playlist.currentVideo.title,
      })
    : t('playlists.syncing');

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onPlayFirst} disabled={!canPlayFirst} hitSlop={8}>
          <MaterialCommunityIcons
            name="play-circle"
            size={40}
            color={canPlayFirst ? theme.colors.primary : theme.colors.outlineVariant}
          />
        </Pressable>

        {playlist.thumbnailUrl ? (
          <Image source={{ uri: playlist.thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
            <MaterialCommunityIcons name="music-note" size={24} color={theme.colors.onSurfaceVariant} />
          </View>
        )}

        <View style={styles.info}>
          <Text numberOfLines={2} variant="titleMedium">{displayName(playlist)}</Text>
          <View style={styles.chipRow}>
            <Chip compact mode="outlined" style={styles.chip}>{t('playlists.detail.trackCount', { count: playlist.videoCount })}</Chip>
            {playlist.totalSize > 0 && (
              <Chip compact mode="outlined" style={styles.chip}>{formatBytes(playlist.totalSize)}</Chip>
            )}
          </View>
        </View>
      </View>

      {(isBusy || isPausing) && (
        <View style={styles.syncStatus}>
          <Text variant="bodySmall" numberOfLines={1} style={{ color: isPausing ? theme.colors.error : theme.colors.onSurfaceVariant }}>
            {statusMessage}
          </Text>
          <ProgressBar
            progress={playlist.syncPhase ? playlist.syncPhase.current / playlist.syncPhase.total : progress}
            style={styles.progress}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 72, height: 54, borderRadius: 8 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 6 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { height: 24 },
  syncStatus: { marginTop: 10 },
  progress: { height: 3, borderRadius: 2, marginTop: 4 },
});
