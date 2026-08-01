import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { RootStackParamList } from '../navigation/types';
import { adminApi, AdminUser } from '../api/admin';
import { Playlist } from '../api/playlists';
import { displayName, formatBytes } from '../utils/format';

type DetailRouteProp = RouteProp<RootStackParamList, 'AdminUserDetail'>;

interface DetailData {
  user: AdminUser;
  playlists: Playlist[];
}

// Mirrors web's UserDetailDialog, as its own pushed screen instead of a
// dialog (same mobile-navigation convention as everywhere else in this app).
export function AdminUserDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const route = useRoute<DetailRouteProp>();
  const { userId } = route.params;
  const [data, setData] = useState<DetailData | 'loading' | 'error'>('loading');

  useEffect(() => {
    setData('loading');
    adminApi.getUser(userId).then(setData).catch(() => setData('error'));
  }, [userId]);

  if (data === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (data === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('users.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={data.playlists}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.chipRow}>
              {data.user.isAdmin && <Chip compact mode="flat" style={styles.chip}>{t('users.adminYes')}</Chip>}
              <Chip
                compact
                mode={data.user.emailVerified ? 'flat' : 'outlined'}
                style={styles.chip}
              >
                {data.user.emailVerified ? t('users.verifiedYes') : t('users.verifiedNo')}
              </Chip>
              <Chip
                compact
                mode={data.user.isBanned ? 'flat' : 'outlined'}
                style={[styles.chip, data.user.isBanned && { backgroundColor: theme.colors.errorContainer }]}
              >
                {data.user.isBanned ? t('users.banned') : t('users.active')}
              </Chip>
            </View>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{t('users.email')}</Text>
            <Text variant="bodyLarge" style={styles.field}>{data.user.email}</Text>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{t('users.displayName')}</Text>
            <Text variant="bodyLarge" style={styles.field}>{data.user.displayName}</Text>

            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{t('users.created')}</Text>
            <Text variant="bodyLarge" style={styles.field}>{new Date(data.user.createdAt).toLocaleString()}</Text>

            <Text variant="titleMedium" style={styles.sectionTitle}>
              {t('users.playlistsTitle', { count: data.playlists.length })}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.playlistRow, { borderColor: theme.colors.outline }]}>
            <Text numberOfLines={1} style={styles.playlistName}>{displayName(item)}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
              {t('playlists.downloadedCount', { count: item.downloadedCount, total: item.videoCount })}
              {item.totalSize > 0 ? ` · ${formatBytes(item.totalSize)}` : ''}
              {item.failedCount > 0 && !item.sourcePlaylistId ? ` · ${t('playlists.failedCount', { count: item.failedCount })}` : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: theme.colors.onSurfaceVariant, paddingHorizontal: 16 }}>{t('users.noPlaylists')}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 24 },
  header: { padding: 16, gap: 2 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  chip: { minHeight: 22 },
  field: { marginBottom: 12 },
  sectionTitle: { marginTop: 8, marginBottom: 4 },
  playlistRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  playlistName: { fontSize: 14, fontWeight: '600' },
});
