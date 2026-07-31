import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useGenres } from './genres/useGenres';
import { GenresFilterBar } from './genres/GenresFilterBar';
import { GenreCard } from './genres/GenreCard';

const GRID_GAP = 10;

// Mirrors frontend/src/pages/GenresPage/index.tsx — client-side search +
// sort, tile grid. Tapping a tile navigates to AllTracksScreen with that
// genre preselected, same as web's allTracksGenreUrl.
export function GenresScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { genres, query, setQuery, setSort } = useGenres();

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <GenresFilterBar onSortChange={setSort} query={query} onQueryChange={setQuery} />

      {genres === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : genres === 'error' ? (
        <View style={styles.center}>
          <Text>{t('genres.failedToLoad')}</Text>
        </View>
      ) : genres.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {query ? t('genres.noResults') : t('genres.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={genres}
          keyExtractor={(g) => g.key}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <GenreCard
              genre={item}
              onPress={() => navigation.navigate('AllTracks', { genreKey: item.key, genreLabel: item.genre })}
            />
          )}
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
