import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardGenre } from '../api/dashboard';
import { GenreRow } from './dashboard/rows';

// Full "Top Genres" list, pushed from DashboardScreen's "See more".
export function AllGenresScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [genres, setGenres] = useState<DashboardGenre[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllGenres().then(setGenres).catch(() => setGenres('error'));
  }, []);

  if (genres === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (genres === 'error') {
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
      data={genres}
      keyExtractor={(genre) => genre.key}
      renderItem={({ item, index }) => <GenreRow genre={item} rank={index + 1} />}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
          {t('dashboard.topGenres.empty')}
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
