import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Menu, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { adminApi, AdminUser, LogAction, LogEntry } from '../api/admin';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RangeKey = '7d' | '30d' | 'all';
const RANGE_DAYS: Record<RangeKey, number | null> = { '7d': 7, '30d': 30, all: null };

// Web's from/to date-picker pair becomes a preset range menu here — a full
// native date-picker widget would need a new dependency for something
// filters rarely need to be more precise than "recently" for; this is the
// same triggers-picker Menu pattern used on AdminTriggersScreen.
const ACTION_BG: Record<LogAction, string | null> = {
  playlist_imported: '#2e7d32',
  playlist_renamed: null,
  playlist_deleted: null, // uses errorContainer, see render
  playlist_synced: null,
  playlist_sync_paused: '#b45309',
  playlist_offline_enabled: null, // uses theme.colors.primary, see render
  generated_playlist_created: '#2e7d32',
  generated_playlist_renamed: null,
  generated_playlist_deleted: null,
  user_logged_in_web: '#2e7d32',
  user_logged_in_mobile: '#2e7d32',
  user_logged_out_web: null,
  user_logged_out_mobile: null,
  deezer_connected: '#2e7d32',
  qobuz_connected: '#2e7d32',
};

function formatDetails(log: LogEntry, t: (key: string, options?: Record<string, unknown>) => string): string {
  const d = log.details as Record<string, any>;
  switch (log.action) {
    case 'playlist_imported':
      return t('logs.detailText.playlistImported', { name: d.name, songCount: d.songCount });
    case 'playlist_renamed':
    case 'generated_playlist_renamed':
      return t('logs.detailText.renamed', { oldName: d.oldName, newName: d.newName });
    case 'playlist_deleted':
    case 'generated_playlist_deleted':
      return t('logs.detailText.deleted', {
        name: d.name, songCount: d.songCount, downloadedCount: d.downloadedCount, failedCount: d.failedCount,
      });
    case 'playlist_synced':
      return t('logs.detailText.synced', {
        name: d.name, downloadedCount: d.downloadedCount, songCount: d.songCount, failedCount: d.failedCount,
      });
    case 'playlist_sync_paused':
      return t('logs.detailText.syncPaused', { name: d.name });
    case 'playlist_offline_enabled':
      return t('logs.detailText.offlineEnabled', { name: d.name });
    case 'generated_playlist_created':
      return t('logs.detailText.generatedCreated', {
        name: d.name, sourceName: d.sourceName, songCount: d.songCount, failedCount: d.failedCount,
      });
    case 'user_logged_in_web':
    case 'user_logged_in_mobile':
      return t('logs.detailText.loggedIn', { email: d.email });
    case 'user_logged_out_web':
    case 'user_logged_out_mobile':
      return t('logs.detailText.loggedOut');
    case 'deezer_connected':
      return t('logs.detailText.deezerConnected');
    case 'qobuz_connected':
      return t('logs.detailText.qobuzConnected');
    default:
      return JSON.stringify(d);
  }
}

export function AdminLogsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'error'>('loading');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>('7d');
  const [logs, setLogs] = useState<LogEntry[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    adminApi.listUsers().then(setUsers).catch(() => setUsers('error'));
  }, []);

  const { from, to } = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days === null) return { from: undefined, to: undefined };
    return { from: new Date(Date.now() - days * MS_PER_DAY).toISOString(), to: new Date().toISOString() };
  }, [range]);

  useEffect(() => {
    setLogs('loading');
    adminApi.listLogs({ userId: selectedUser?.id, from, to }).then(setLogs).catch(() => setLogs('error'));
  }, [selectedUser, from, to]);

  const rangeLabel = range === '7d' ? t('logs.range.last7Days') : range === '30d' ? t('logs.range.last30Days') : t('logs.range.allTime');

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.filterRow}>
        <Menu
          visible={userMenuOpen}
          onDismiss={() => setUserMenuOpen(false)}
          anchor={
            <Pressable onPress={() => setUserMenuOpen(true)} style={[styles.filter, { borderColor: theme.colors.outline }]}>
              <Text numberOfLines={1} style={styles.filterText}>
                {selectedUser ? selectedUser.displayName : t('logs.allUsers')}
              </Text>
              <MaterialCommunityIcons name="menu-down" size={18} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          }
        >
          <Menu.Item title={t('logs.allUsers')} onPress={() => { setSelectedUser(null); setUserMenuOpen(false); }} />
          {users !== 'loading' && users !== 'error' && users.map(u => (
            <Menu.Item key={u.id} title={`${u.displayName} (${u.email})`} onPress={() => { setSelectedUser(u); setUserMenuOpen(false); }} />
          ))}
        </Menu>

        <Menu
          visible={rangeMenuOpen}
          onDismiss={() => setRangeMenuOpen(false)}
          anchor={
            <Pressable onPress={() => setRangeMenuOpen(true)} style={[styles.filter, { borderColor: theme.colors.outline }]}>
              <Text numberOfLines={1} style={styles.filterText}>{rangeLabel}</Text>
              <MaterialCommunityIcons name="menu-down" size={18} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          }
        >
          <Menu.Item title={t('logs.range.last7Days')} onPress={() => { setRange('7d'); setRangeMenuOpen(false); }} />
          <Menu.Item title={t('logs.range.last30Days')} onPress={() => { setRange('30d'); setRangeMenuOpen(false); }} />
          <Menu.Item title={t('logs.range.allTime')} onPress={() => { setRange('all'); setRangeMenuOpen(false); }} />
        </Menu>
      </View>

      {logs === 'loading' && (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      )}
      {logs === 'error' && (
        <View style={styles.center}><Text>{t('logs.loadLogsError')}</Text></View>
      )}
      {Array.isArray(logs) && (
        <FlatList
          data={logs}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const bg = item.action === 'playlist_deleted' || item.action === 'generated_playlist_deleted'
              ? theme.colors.errorContainer
              : item.action === 'playlist_offline_enabled'
              ? theme.colors.primary
              : ACTION_BG[item.action] ?? theme.colors.elevation.level3;
            return (
              <View style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}>
                <View style={styles.rowHeader}>
                  <Chip compact mode="flat" style={[styles.chip, { backgroundColor: bg }]} textStyle={styles.chipText}>
                    {t(`logs.actions.${item.action}`)}
                  </Chip>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                  {item.userDisplayName} ({item.userEmail})
                </Text>
                <Text style={styles.details}>{formatDetails(item, t)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 40, color: theme.colors.onSurfaceVariant }}>{t('logs.empty')}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, padding: 12 },
  filter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterText: { flex: 1, fontSize: 13 },
  list: { paddingHorizontal: 12, paddingBottom: 24, gap: 8 },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    marginBottom: 8,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: { minHeight: 22, alignSelf: 'flex-start' },
  chipText: { color: '#ffffff' },
  details: { fontSize: 13, marginTop: 2 },
});
