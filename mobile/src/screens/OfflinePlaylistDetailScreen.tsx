import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OfflineStackParamList } from '../navigation/offlineTypes';
import { useOfflineDownloads } from '../offline/OfflineDownloadsContext';
import { toPlaylistVideo } from '../offline/toPlaylistVideo';
import { usePlayer } from '../contexts/PlayerContext';
import { displayName, formatDuration } from '../utils/format';

type DetailRouteProp = RouteProp<OfflineStackParamList, 'OfflinePlaylistDetail'>;

// The offline-mode equivalent of PlaylistDetailScreen — deliberately
// slimmer: no genre chips, no sort/search/filter bar, no "⋮" menu, and
// tapping a row plays it directly rather than opening TrackDetail (which
// depends on data — recommendations, full metadata — this mode doesn't
// have). What it must have is every downloaded track, playable straight
// from local storage via PlayerContext's local-file-first source resolution.
export function OfflinePlaylistDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<DetailRouteProp>();
  const { playlistId } = route.params;
  const { entries } = useOfflineDownloads();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  const entry = entries[playlistId];

  const queue = useMemo(
    () => entry
      ? [...entry.tracks].sort((a, b) => a.position - b.position).map(t => toPlaylistVideo(t, playlistId))
      : [],
    [entry, playlistId]
  );

  if (!entry) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('offline.playlistNotFound')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.colors.onBackground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="titleMedium" numberOfLines={1}>{displayName(entry)}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            {t('offline.trackCount', { count: queue.length })}
          </Text>
        </View>
      </View>
      <FlatList
        data={queue}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isCurrent = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === item.id;
          return (
            <Pressable onPress={() => handleTogglePlay(playlistId, item, queue)} style={styles.row}>
              <View style={styles.playSlot}>
                <MaterialCommunityIcons
                  name={isCurrent && isAudioPlaying ? 'pause' : 'play'}
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.text}>
                <Text
                  numberOfLines={1}
                  style={[styles.title, { color: isCurrent ? theme.colors.primary : theme.colors.onBackground }]}
                >
                  {item.title}
                </Text>
                {item.artist && (
                  <Text numberOfLines={1} style={[styles.artist, { color: theme.colors.onSurfaceVariant }]}>{item.artist}</Text>
                )}
              </View>
              <Text style={[styles.duration, { color: theme.colors.onSurfaceVariant }]}>{formatDuration(item.duration)}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>{t('offline.noTracks')}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  list: { paddingBottom: 96 },
  empty: { textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  playSlot: { width: 24, alignItems: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 14 },
  artist: { fontSize: 12, marginTop: 1 },
  duration: { fontSize: 12, width: 40, textAlign: 'right' },
});
