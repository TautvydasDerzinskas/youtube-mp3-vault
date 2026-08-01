import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Banner, Button, Menu, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { adminApi, AdminUser } from '../api/admin';
import { Playlist } from '../api/playlists';
import { displayName } from '../utils/format';

interface Result {
  type: 'success' | 'error';
  message: string;
}

// Mirrors web's TriggersPage — pick a user, pick one of their playlists,
// trigger a soft reimport (re-runs title normalization/MusicBrainz matching/
// audio analysis against already-downloaded files, no re-download). Web's
// two <select> dropdowns become tap-to-open Menus here, the closest mobile
// equivalent react-native-paper offers.
export function AdminTriggersScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  const [triggering, setTriggering] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  const handleSelectUser = (user: AdminUser) => {
    setUserMenuOpen(false);
    setSelectedUser(user);
    setSelectedPlaylist(null);
    setPlaylists([]);
    setResult(null);
    setPlaylistsLoading(true);
    adminApi.getUser(user.id)
      .then(({ playlists }) => setPlaylists(playlists))
      .catch(() => setResult({ type: 'error', message: t('triggers.loadPlaylistsError') }))
      .finally(() => setPlaylistsLoading(false));
  };

  const handleTrigger = async () => {
    if (!selectedPlaylist) return;
    setTriggering(true);
    setResult(null);
    try {
      await adminApi.triggerSoftReimport(selectedPlaylist.id);
      setResult({ type: 'success', message: t('triggers.softReimport.started') });
    } catch (err: any) {
      setResult({ type: 'error', message: err?.response?.data?.error ?? t('triggers.softReimport.genericError') });
    } finally {
      setTriggering(false);
    }
  };

  if (users === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (users === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('triggers.loadUsersError')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <Text variant="titleMedium">{t('triggers.softReimport.title')}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
        {t('triggers.softReimport.description')}
      </Text>

      <Text variant="labelMedium" style={styles.label}>{t('triggers.selectUser')}</Text>
      <Menu
        visible={userMenuOpen}
        onDismiss={() => setUserMenuOpen(false)}
        anchor={
          <Pressable
            onPress={() => setUserMenuOpen(true)}
            style={[styles.picker, { borderColor: theme.colors.outline }]}
          >
            <Text numberOfLines={1} style={styles.pickerText}>
              {selectedUser ? `${selectedUser.displayName} (${selectedUser.email})` : t('triggers.selectUser')}
            </Text>
            <MaterialCommunityIcons name="menu-down" size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        }
      >
        {users.map(u => (
          <Menu.Item key={u.id} title={`${u.displayName} (${u.email})`} onPress={() => handleSelectUser(u)} />
        ))}
      </Menu>

      <Text variant="labelMedium" style={styles.label}>{t('triggers.selectPlaylist')}</Text>
      <Menu
        visible={playlistMenuOpen}
        onDismiss={() => setPlaylistMenuOpen(false)}
        anchor={
          <Pressable
            onPress={() => selectedUser && playlists.length > 0 && setPlaylistMenuOpen(true)}
            style={[
              styles.picker,
              { borderColor: theme.colors.outline },
              (!selectedUser || playlists.length === 0) && styles.pickerDisabled,
            ]}
          >
            {playlistsLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text numberOfLines={1} style={styles.pickerText}>
                {selectedPlaylist ? displayName(selectedPlaylist) : t('triggers.selectPlaylist')}
              </Text>
            )}
            <MaterialCommunityIcons name="menu-down" size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        }
      >
        {playlists.map(p => (
          <Menu.Item key={p.id} title={displayName(p)} onPress={() => { setSelectedPlaylist(p); setPlaylistMenuOpen(false); }} />
        ))}
      </Menu>
      {selectedUser && !playlistsLoading && playlists.length === 0 && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {t('triggers.noPlaylists')}
        </Text>
      )}

      {result && (
        <Banner visible icon={result.type === 'success' ? 'check-circle-outline' : 'alert-circle-outline'} style={styles.banner}>
          {result.message}
        </Banner>
      )}

      <Button
        mode="contained"
        buttonColor={theme.colors.error}
        disabled={!selectedPlaylist || triggering}
        loading={triggering}
        onPress={handleTrigger}
        style={styles.triggerButton}
      >
        {t('triggers.softReimport.trigger')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16 },
  label: { marginTop: 16, marginBottom: 6 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerDisabled: { opacity: 0.5 },
  pickerText: { flex: 1 },
  banner: { marginTop: 16 },
  triggerButton: { marginTop: 20, alignSelf: 'flex-start' },
});
