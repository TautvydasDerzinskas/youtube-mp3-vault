import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardArtist } from '../api/dashboard';
import { ArtistRow } from './dashboard/rows';

// Full "Top Artists" list, pushed from DashboardScreen's "See more".
export function AllArtistsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [artists, setArtists] = useState<DashboardArtist[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllArtists().then(setArtists).catch(() => setArtists('error'));
  }, []);

  if (artists === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (artists === 'error') {
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
      data={artists}
      keyExtractor={(artist) => artist.key}
      renderItem={({ item, index }) => <ArtistRow artist={item} rank={index + 1} />}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
          {t('dashboard.topArtists.empty')}
        </Text>
      }
      initialNumToRender={16}
      maxToRenderPerBatch={16}
      windowSize={5}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
});
