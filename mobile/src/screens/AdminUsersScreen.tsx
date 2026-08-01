import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, IconButton, Text, Tooltip, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { adminApi, AdminUser } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Mirrors web's UsersPage — a table there, a row list here (a phone-width
// table would need horizontal scrolling for 9 columns, which reads far
// worse than a stacked card per user). Detail view is its own pushed screen
// (AdminUserDetailScreen) rather than web's dialog, same reasoning as the
// rest of this app's mobile-vs-web navigation choices (see PlaylistDetail).
export function AdminUsersScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmBanUser, setConfirmBanUser] = useState<AdminUser | null>(null);

  const load = useCallback(() => {
    setUsers('loading');
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  useEffect(load, [load]);

  const performToggleBan = async (user: AdminUser) => {
    setActioningId(user.id);
    try {
      const updated = user.isBanned ? await adminApi.unbanUser(user.id) : await adminApi.banUser(user.id);
      setUsers(prev => (Array.isArray(prev) ? prev.map(u => (u.id === updated.id ? updated : u)) : prev));
    } finally {
      setActioningId(null);
    }
  };

  // Banning is destructive (immediately revokes access) so it's confirmed
  // first; unbanning takes effect immediately, same asymmetry as web.
  const handleToggleBan = (user: AdminUser) => {
    if (user.isBanned) {
      performToggleBan(user);
    } else {
      setConfirmBanUser(user);
    }
  };

  const handleConfirmBan = async () => {
    if (!confirmBanUser) return;
    await performToggleBan(confirmBanUser);
    setConfirmBanUser(null);
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
        <Text>{t('users.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cannotBan = item.isAdmin && !item.isBanned;
          return (
            <Pressable
              onPress={() => navigation.navigate('AdminUserDetail', { userId: item.id })}
              style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
            >
              <View style={styles.info}>
                <Text numberOfLines={1} style={styles.name}>{item.displayName}</Text>
                <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{item.email}</Text>
                <View style={styles.chipRow}>
                  {item.isAdmin && <Chip compact mode="flat" style={styles.chip}>{t('users.adminYes')}</Chip>}
                  {item.isBanned ? (
                    <Chip compact mode="flat" style={[styles.chip, { backgroundColor: theme.colors.errorContainer }]}>{t('users.banned')}</Chip>
                  ) : (
                    <Chip compact mode="outlined" style={styles.chip}>{t('users.active')}</Chip>
                  )}
                  {!item.emailVerified && <Chip compact mode="outlined" style={styles.chip}>{t('users.verifiedNo')}</Chip>}
                  <Chip compact mode="outlined" style={styles.chip}>{t('users.playlistsCount', { count: item.playlistCount })}</Chip>
                </View>
              </View>
              {cannotBan ? (
                <Tooltip title={t('users.cannotBanAdmin')}>
                  <IconButton icon="cancel" disabled iconColor={theme.colors.outlineVariant} />
                </Tooltip>
              ) : item.id === currentUser?.id ? null : (
                <IconButton
                  icon={item.isBanned ? 'check-circle-outline' : 'cancel'}
                  iconColor={item.isBanned ? '#2e7d32' : theme.colors.error}
                  disabled={actioningId === item.id}
                  onPress={(e) => { e.stopPropagation(); handleToggleBan(item); }}
                />
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 40, color: theme.colors.onSurfaceVariant }}>{t('users.empty')}</Text>
        }
      />

      {confirmBanUser && (
        <ConfirmDialog
          visible
          title={t('users.banConfirm.title')}
          message={t('users.banConfirm.message', { name: confirmBanUser.displayName })}
          confirmLabel={t('users.ban')}
          cancelLabel={t('common.cancel')}
          destructive
          loading={actioningId === confirmBanUser.id}
          onConfirm={handleConfirmBan}
          onCancel={() => setConfirmBanUser(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  info: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  chip: { minHeight: 22 },
});
