import { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { usePlayer } from '../contexts/PlayerContext';
import { usePlaylistDetail } from './playlistDetail/usePlaylistDetail';
import { Header } from './playlistDetail/Header';
import { FilterBar } from './playlistDetail/FilterBar';
import { TrackRow } from './playlistDetail/TrackRow';
import { displayName } from '../utils/format';

type PlaylistDetailRouteProp = RouteProp<RootStackParamList, 'PlaylistDetail'>;

// Mirrors frontend/src/pages/PlaylistDetailPage/index.tsx — see Header.tsx
// for the sync-status banner that's mobile's stand-in for web's inline
// accordion expansion.
export function PlaylistDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<PlaylistDetailRouteProp>();
  const { playlistId } = route.params;
  const { nowPlaying, isAudioPlaying, handleTogglePlay, isShuffle } = usePlayer();

  const {
    playlist, videos, filteredTracks, orderedPlayableTracks, firstPlayableTrack,
    sort, setSort, searchQuery, setSearchQuery,
  } = usePlaylistDetail(playlistId);

  useEffect(() => {
    if (playlist !== 'loading' && playlist !== 'error') {
      navigation.setOptions({ title: displayName(playlist) });
    }
  }, [navigation, playlist]);

  const playableQueue = useMemo(() => filteredTracks.filter(v => v.downloadStatus === 'done'), [filteredTracks]);

  const isPlaylistPlaying = nowPlaying?.playlistId === playlistId && isAudioPlaying;

  const handlePlayFirst = () => {
    if (orderedPlayableTracks.length === 0) return;
    // Already playing this playlist — the header button acts as pause/resume
    // on the current track rather than jumping to a new (possibly random)
    // one.
    if (nowPlaying?.playlistId === playlistId) {
      const current = orderedPlayableTracks.find(t => t.id === nowPlaying.videoId) ?? firstPlayableTrack;
      if (current) handleTogglePlay(playlistId, current, orderedPlayableTracks);
      return;
    }
    const startTrack = isShuffle
      ? orderedPlayableTracks[Math.floor(Math.random() * orderedPlayableTracks.length)]
      : firstPlayableTrack;
    if (startTrack) handleTogglePlay(playlistId, startTrack, orderedPlayableTracks);
  };

  if (playlist === 'loading' || videos === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (playlist === 'error' || videos === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('playlists.detail.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Header playlist={playlist} canPlayFirst={firstPlayableTrack !== null} onPlayFirst={handlePlayFirst} isPlaying={isPlaylistPlaying} />
      <FilterBar sort={sort} onSortChange={setSort} searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} />
      <FlatList
        data={filteredTracks}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => <TrackRow track={item} playlistId={playlistId} queue={playableQueue} />}
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
