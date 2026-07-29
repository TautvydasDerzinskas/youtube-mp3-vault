import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardArtist, DashboardGenre, DashboardSong } from '../../api/dashboard';

// Shared between each DashboardListCard preview and the corresponding "see
// more" screen (AllSongsScreen/AllArtistsScreen/AllGenresScreen), so the
// row layout only exists in one place. Not interactive yet — there's no
// playlist-track/artist-detail/genre-filtered-tracks screen on mobile yet
// to navigate to (unlike web's equivalent rows), so these are display-only
// until those destinations exist.

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rank: {
    width: 20,
    fontSize: 12,
    textAlign: 'center',
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  trailing: {
    fontSize: 12,
  },
});

export function SongRow({ song, rank }: { song: DashboardSong; rank: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [song.thumbnailUrl]);

  return (
    <View style={styles.row}>
      <Text style={[styles.rank, { color: theme.colors.onSurfaceVariant }]}>{rank}</Text>
      {song.thumbnailUrl && !imageFailed ? (
        <Image source={{ uri: song.thumbnailUrl }} style={styles.thumb} onError={() => setImageFailed(true)} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
          <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
        </View>
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>{song.title}</Text>
        {song.artist && (
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>{song.artist}</Text>
        )}
      </View>
      <Text style={[styles.trailing, { color: theme.colors.onSurfaceVariant }]}>
        {t('dashboard.playCount', { count: song.playCount })}
      </Text>
    </View>
  );
}

export function ArtistRow({ artist, rank }: { artist: DashboardArtist; rank: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, { color: theme.colors.onSurfaceVariant }]}>{rank}</Text>
      <Text numberOfLines={1} style={[styles.text, styles.title, { color: theme.colors.onBackground }]}>{artist.artist}</Text>
      <Text style={[styles.trailing, { color: theme.colors.onSurfaceVariant }]}>
        {t('dashboard.songCount', { count: artist.songCount })}
      </Text>
    </View>
  );
}

export function GenreRow({ genre, rank }: { genre: DashboardGenre; rank: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, { color: theme.colors.onSurfaceVariant }]}>{rank}</Text>
      <Text numberOfLines={1} style={[styles.text, styles.title, { color: theme.colors.onBackground }]}>{genre.genre}</Text>
      <Text style={[styles.trailing, { color: theme.colors.onSurfaceVariant }]}>
        {t('dashboard.songCount', { count: genre.count })}
      </Text>
    </View>
  );
}
