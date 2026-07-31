import { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useArtistDetail } from './artistDetail/useArtistDetail';
import { ArtistDetailHeader } from './artistDetail/ArtistDetailHeader';
import { TrackRow } from './playlistDetail/TrackRow';

type ArtistDetailRouteProp = RouteProp<RootStackParamList, 'ArtistDetail'>;

// Mirrors frontend/src/pages/ArtistDetailPage/index.tsx — reuses TrackRow
// the same way AllTracksScreen does (each row resolves its own playlistId
// from track.playlistId, since an artist's tracks can span playlists).
export function ArtistDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<ArtistDetailRouteProp>();
  const { key } = route.params;
  const { artist, playableQueue } = useArtistDetail(key);

  useEffect(() => {
    if (artist !== 'loading' && artist !== 'error') {
      navigation.setOptions({ title: artist.name });
    }
  }, [navigation, artist]);

  if (artist === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (artist === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('artists.detail.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={artist.videos}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <TrackRow track={item} queue={playableQueue} />}
        ListHeaderComponent={<ArtistDetailHeader artist={artist} />}
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
  list: { paddingBottom: 24 },
  empty: { textAlign: 'center', marginTop: 40 },
});
