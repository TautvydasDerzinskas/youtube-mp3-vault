import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useArtists } from './artists/useArtists';
import { ArtistsFilterBar } from './artists/ArtistsFilterBar';
import { ArtistCard } from './artists/ArtistCard';

const GRID_GAP = 10;

// Mirrors frontend/src/pages/ArtistsPage/index.tsx — server-side debounced
// search, client-side sort, tile grid. Web uses a wrapping CSS grid; mobile
// uses FlatList's numColumns for the equivalent 2-column layout.
export function ArtistsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { query, setQuery, debouncedQuery, artists, sort, setSort } = useArtists();

  // One stable reference for every card (see ArtistCard's memo()) rather
  // than a fresh closure per row on every render of this list.
  const handlePressArtist = useCallback(
    (key: string) => navigation.navigate('ArtistDetail', { key }),
    [navigation]
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <ArtistsFilterBar sort={sort} onSortChange={setSort} query={query} onQueryChange={setQuery} />

      {artists === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : artists === 'error' ? (
        <View style={styles.center}>
          <Text>{t('artists.failedToLoad')}</Text>
        </View>
      ) : artists.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {debouncedQuery ? t('artists.noResults') : t('artists.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(a) => a.key}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ArtistCard artist={item} sort={sort} onPress={handlePressArtist} />
          )}
          // Tuned for a grid that can run into the hundreds of tiles on a
          // large library — smaller window/batch sizes trade a bit more
          // blank space during a fast fling for meaningfully less work per
          // frame, which matters most on exactly the slower devices this is
          // for. removeClippedSubviews detaches off-screen rows from the
          // native view tree entirely (Android especially benefits).
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 12, gap: GRID_GAP },
  row: { gap: GRID_GAP },
});
