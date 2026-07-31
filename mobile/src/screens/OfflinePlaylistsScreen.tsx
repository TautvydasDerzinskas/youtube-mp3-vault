import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfflineDownloads } from '../offline/OfflineDownloadsContext';
import { OfflineStackParamList } from '../navigation/offlineTypes';
import { displayName } from '../utils/format';

type Nav = NativeStackNavigationProp<OfflineStackParamList, 'OfflinePlaylists'>;

// Rendered by AppShell in place of the normal tab content whenever the
// configured server can't be reached (see RootNavigator.tsx and
// useServerReachability) — reads only from the local offline-download index
// (mobile/src/offline/), never hits the network. Thumbnails are shown as a
// plain icon rather than attempting the real (backend-hosted) thumbnailUrl,
// since that would just be a guaranteed-failing request in this mode.
export function OfflinePlaylistsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { entries } = useOfflineDownloads();

  const playlists = useMemo(
    () => Object.values(entries)
      .filter(p => p.tracks.length > 0)
      .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [entries]
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.banner, { backgroundColor: theme.colors.elevation.level1 }]}>
        <MaterialCommunityIcons name="wifi-off" size={18} color={theme.colors.onSurfaceVariant} />
        <Text style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>{t('offline.unavailableBanner')}</Text>
      </View>
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.playlistId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('OfflinePlaylistDetail', { playlistId: item.playlistId })}
            style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
          >
            <View style={[styles.thumb, { backgroundColor: theme.colors.elevation.level3 }]}>
              <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
            </View>
            <View style={styles.info}>
              <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>{displayName(item)}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                {t('offline.trackCount', { count: item.tracks.length })}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="cloud-off-outline" size={48} color={theme.colors.onSurfaceVariant} />
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
              {t('offline.emptyState')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  list: { padding: 12, paddingBottom: 96 },
  emptyState: { alignItems: 'center', padding: 24, paddingTop: 48 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  thumb: { width: 48, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, fontWeight: '600' },
});
