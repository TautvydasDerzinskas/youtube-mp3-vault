import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, Divider, Portal, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOfflineDownloads } from '../offline/OfflineDownloadsContext';
import { useAuth } from '../contexts/AuthContext';
import { useServerConfig } from '../contexts/ServerConfigContext';
import { OfflineStackParamList } from '../navigation/offlineTypes';
import { displayName } from '../utils/format';

type Nav = NativeStackNavigationProp<OfflineStackParamList, 'OfflinePlaylists'>;

// Rendered by AppShell in place of the normal tab content whenever the
// configured server can't be reached (see RootNavigator.tsx and
// useServerReachability) — reads only from the local offline-download index
// (mobile/src/offline/), never hits the network for the list itself.
// Thumbnails do render their real thumbnailUrl (same as online's
// PlaylistRow/TrackRow) rather than a plain icon — that URL was already
// fetched once while online, and Image's own disk cache means it keeps
// rendering from there even with the server genuinely unreachable; a bare
// icon here would actually be a regression from what the user already sees
// in the mini player, which shows the real thumbnail for the same reason.
export function OfflinePlaylistsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { entries } = useOfflineDownloads();
  const { logout } = useAuth();
  const { clearServerUrl } = useServerConfig();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const playlists = useMemo(
    () => Object.values(entries)
      .filter(p => p.tracks.length > 0)
      .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [entries]
  );

  const totalTrackCount = useMemo(
    () => Object.values(entries).reduce((sum, p) => sum + p.tracks.length, 0),
    [entries]
  );

  // Escape hatch for a stuck offline mode (e.g. the server's IP/domain
  // changed while the app was away) — TopBar/Profile aren't reachable here
  // (see the doc comment on this screen), so this is the only way back to
  // ServerSetupScreen without reinstalling. logout() before clearServerUrl()
  // so the best-effort server-side logout call still targets the server the
  // current token is actually valid for — see ServerConfigContext's
  // clearServerUrl doc comment.
  const handleChangeServer = async () => {
    setConfirmingLogout(false);
    await logout();
    await clearServerUrl();
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.banner, { backgroundColor: theme.colors.elevation.level1 }]}>
        <MaterialCommunityIcons name="wifi-off" size={18} color={theme.colors.onSurfaceVariant} />
        <Text style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>{t('offline.unavailableBanner')}</Text>
        <Button compact mode="text" textColor={theme.colors.error} onPress={() => setConfirmingLogout(true)}>
          {t('offline.changeServer')}
        </Button>
      </View>

      <Portal>
        <Dialog visible={confirmingLogout} onDismiss={() => setConfirmingLogout(false)}>
          <Dialog.Title>{t('offline.changeServerTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('offline.changeServerBody')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmingLogout(false)}>{t('serverSetup.cancel')}</Button>
            <Button onPress={handleChangeServer} textColor={theme.colors.error}>{t('offline.changeServer')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.playlistId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('OfflinePlaylistDetail', { playlistId: item.playlistId })}
            style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
          >
            {item.thumbnailUrl ? (
              <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
                <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
              </View>
            )}
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
        ListFooterComponent={
          <>
            <Divider style={styles.divider} />
            <Pressable
              onPress={() => navigation.navigate('OfflineAllTracks')}
              style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
            >
              <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
                <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
              </View>
              <View style={styles.info}>
                <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>
                  {t('playlists.allTracks.title')}
                </Text>
                <Chip compact mode="outlined" style={styles.chip}>
                  {t('offline.trackCount', { count: totalTrackCount })}
                </Chip>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </>
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
  thumb: { width: 48, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14, fontWeight: '600' },
  divider: { marginVertical: 12 },
  chip: { minHeight: 24, alignSelf: 'flex-start' },
});
