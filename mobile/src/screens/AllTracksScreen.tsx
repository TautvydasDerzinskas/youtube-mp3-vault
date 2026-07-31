import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useAllTracksDetail } from './allTracks/useAllTracksDetail';
import { FilterBar } from './playlistDetail/FilterBar';
import { TrackRow } from './playlistDetail/TrackRow';
import { formatGenre, formatPlaybackTime } from '../utils/format';

type AllTracksRouteProp = RouteProp<RootStackParamList, 'AllTracks'>;

// Mirrors frontend/src/pages/AllTracksPage/index.tsx — reuses the same
// FilterBar/TrackRow as PlaylistDetailScreen (TrackRow resolves each row's
// own playlistId from track.playlistId here, since rows span playlists —
// see TrackRow.tsx). No thumbnail/play-first button or sync-status concept:
// this is a virtual aggregate, not a real playlist, same as web's Header.
export function AllTracksScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const route = useRoute<AllTracksRouteProp>();
  const {
    status, summary, filteredTracks, playableQueue, sort, setSort, searchQuery, setSearchQuery,
    genreFilter, setGenreFilter,
  } = useAllTracksDetail(route.params?.genreKey);

  if (status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (status === 'error' || !summary) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('playlists.detail.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {summary.totalDurationSec > 0
            ? `${formatPlaybackTime(summary.totalDurationSec, t)} · ${t('playlists.allTracks.sourcedFromYoutube')}`
            : t('playlists.allTracks.sourcedFromYoutube')}
        </Text>
        <View style={styles.chipRow}>
          <Chip compact mode="outlined" style={styles.chip}>
            {t('playlists.detail.trackCount', { count: summary.songCount })}
          </Chip>
          {genreFilter && (
            <Chip compact mode="flat" style={styles.chip} onClose={() => setGenreFilter(null)}>
              {route.params?.genreLabel ?? formatGenre(genreFilter)}
            </Chip>
          )}
        </View>
      </View>
      <FilterBar sort={sort} onSortChange={setSort} searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} />
      <FlatList
        data={filteredTracks}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <TrackRow track={item} queue={playableQueue} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>{t('playlists.detail.noTracks')}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 6 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { height: 24, alignSelf: 'flex-start' },
  list: { paddingBottom: 24 },
  empty: { textAlign: 'center', marginTop: 40 },
});
