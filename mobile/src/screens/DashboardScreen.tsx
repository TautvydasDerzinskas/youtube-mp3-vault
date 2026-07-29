import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { dashboardApi, DashboardSummary } from '../api/dashboard';
import { StatCard } from './dashboard/StatCard';
import { DashboardListCard } from './dashboard/DashboardListCard';
import { SongRow, ArtistRow, GenreRow } from './dashboard/rows';

const GRID_GAP = 12;

// Mirrors web's frontend/src/pages/DashboardPage, but laid out for mobile:
// a 2x2 square grid of the 4 stat panes up top (web spreads them down a
// side column instead), then Songs on Repeat / Top Artists / Top Genres
// stacked full-width below, in that order. "See more" pushes a dedicated
// screen rather than web's modal dialogs — see AllSongsScreen and friends.
// All copy reuses the exact same i18n keys as frontend/src/i18n's
// "dashboard"/"nav" namespaces.
export function DashboardScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [summary, setSummary] = useState<DashboardSummary | 'loading' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await dashboardApi.getSummary();
      setSummary(result);
    } catch {
      setSummary('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (summary === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (summary === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('dashboard.loadError')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatCard
            icon="playlist-music"
            count={summary.playlistCount}
            label={t('dashboard.playlistCount.label', { count: summary.playlistCount })}
            onPress={() => navigation.navigate('Playlists')}
          />
          {/* No "all songs" tab exists on mobile yet (unlike web's
              /all-tracks) to send this to, so it's display-only for now. */}
          <StatCard
            icon="music-note"
            count={summary.totalSongCount}
            label={t('dashboard.totalSongCount.label', { count: summary.totalSongCount })}
          />
        </View>
        <View style={styles.gridRow}>
          <StatCard
            icon="microphone-variant"
            count={summary.totalArtistCount}
            label={t('dashboard.artistCount.label', { count: summary.totalArtistCount })}
            onPress={() => navigation.navigate('Artists')}
          />
          <StatCard
            icon="tag-multiple"
            count={summary.totalGenreCount}
            label={t('dashboard.genreCount.label', { count: summary.totalGenreCount })}
            onPress={() => navigation.navigate('Genres')}
          />
        </View>
      </View>

      <DashboardListCard
        icon="repeat"
        title={t('dashboard.songsOnRepeat.title')}
        items={summary.topSongs}
        emptyText={t('dashboard.songsOnRepeat.empty')}
        onSeeMore={() => navigation.navigate('AllSongs')}
        keyExtractor={(song) => song.id}
        renderItem={(song, index) => <SongRow song={song} rank={index + 1} />}
      />

      <DashboardListCard
        icon="star"
        title={t('dashboard.topArtists.title')}
        items={summary.topArtists}
        emptyText={t('dashboard.topArtists.empty')}
        onSeeMore={() => navigation.navigate('AllArtists')}
        keyExtractor={(artist) => artist.key}
        renderItem={(artist, index) => <ArtistRow artist={artist} rank={index + 1} />}
      />

      <DashboardListCard
        icon="tag-multiple"
        title={t('dashboard.topGenres.title')}
        items={summary.topGenres}
        emptyText={t('dashboard.topGenres.empty')}
        onSeeMore={() => navigation.navigate('AllGenres')}
        keyExtractor={(genre) => genre.key}
        renderItem={(genre, index) => <GenreRow genre={genre} rank={index + 1} />}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16 },
  grid: { gap: GRID_GAP },
  gridRow: { flexDirection: 'row', gap: GRID_GAP },
});
