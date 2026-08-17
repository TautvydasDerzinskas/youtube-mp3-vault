import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfflineDownloads } from '../offline/OfflineDownloadsContext';
import { toPlaylistVideo } from '../offline/toPlaylistVideo';
import { usePlayer } from '../contexts/PlayerContext';
import { formatDuration } from '../utils/format';

// The offline-mode equivalent of AllTracksScreen — every downloaded track
// across every offline-synced playlist, flattened into one list. One row
// per playlist-track association rather than deduped by song, mirroring
// online's GET /api/playlists/all-tracks (backend/src/routes/youtube.ts) —
// a song synced via two playlists appears twice there too. Reached from
// BottomNav's middle button while offline (see MiddleButton in BottomNav.tsx)
// — there's no in-list entry point the way AllTracksListItem provides
// online, since OfflinePlaylistsScreen deliberately stays minimal.
//
// Deliberately slimmer than AllTracksScreen for the same reasons
// OfflinePlaylistDetailScreen is: no genre chips, no sort/search bar,
// tapping a row plays it directly.
export function OfflineAllTracksScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { entries } = useOfflineDownloads();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  const queue = useMemo(
    () => Object.values(entries)
      .flatMap(entry => entry.tracks.map(t => toPlaylistVideo(t, entry.playlistId)))
      .sort((a, b) => a.title.localeCompare(b.title)),
    [entries]
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.colors.onBackground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="titleMedium" numberOfLines={1}>{t('playlists.allTracks.title')}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            {t('offline.trackCount', { count: queue.length })}
          </Text>
        </View>
      </View>
      <FlatList
        data={queue}
        keyExtractor={(v, index) => `${v.playlistId}:${v.id}:${index}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const itemPlaylistId = item.playlistId ?? '';
          const isCurrent = nowPlaying?.playlistId === itemPlaylistId && nowPlaying?.videoId === item.id;
          return (
            <Pressable onPress={() => handleTogglePlay(itemPlaylistId, item, queue)} style={styles.row}>
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
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>{t('offline.noTracksAtAll')}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
