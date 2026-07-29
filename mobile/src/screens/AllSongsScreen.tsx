import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardSong } from '../api/dashboard';
import { SongRow } from './dashboard/rows';

// Full "Songs on Repeat" list, pushed from DashboardScreen's "See more" —
// a dedicated screen rather than a modal dialog (unlike web's
// AllSongsDialog), since a scrollable list of up to 500 rows suits a
// full-screen push with native back navigation better on mobile.
export function AllSongsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [songs, setSongs] = useState<DashboardSong[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllSongs().then(setSongs).catch(() => setSongs('error'));
  }, []);

  if (songs === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (songs === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('dashboard.loadError')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.list}
      data={songs}
      keyExtractor={(song) => song.id}
      renderItem={({ item, index }) => <SongRow song={item} rank={index + 1} />}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
          {t('dashboard.songsOnRepeat.empty')}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
});
