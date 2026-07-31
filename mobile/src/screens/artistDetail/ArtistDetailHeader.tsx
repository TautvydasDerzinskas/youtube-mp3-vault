import { Image, StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArtistDetail } from '../../api/artists';

interface ArtistDetailHeaderProps {
  artist: ArtistDetail;
}

// Mirrors frontend/src/pages/ArtistDetailPage/Header.tsx — avatar, name,
// song/play-count chips, bio, genre chips, and "appears in" playlist chips.
// Genre chips are display-only here (not clickable) — web routes them to
// an all-tracks-filtered-by-genre view, which mobile's AllTracksScreen
// doesn't support yet (no genre filter UI there). "Appears in" chips do
// navigate, since PlaylistDetailScreen already exists.
export function ArtistDetailHeader({ artist }: ArtistDetailHeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {artist.thumbnailUrl ? (
          <Image source={{ uri: artist.thumbnailUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
            <MaterialCommunityIcons name="music-note" size={32} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        <View style={styles.info}>
          <Text variant="titleMedium">{artist.name}</Text>
          <View style={styles.chipRow}>
            <Chip compact mode="outlined" style={styles.chip}>
              {t('artists.detail.songCount', { count: artist.songCount })}
            </Chip>
            <Chip compact mode="outlined" style={styles.chip}>
              {t('artists.detail.totalPlayCount', { count: artist.totalPlayCount })}
            </Chip>
          </View>
        </View>
      </View>

      {artist.bio && (
        <Text variant="bodySmall" style={[styles.bio, { color: theme.colors.onSurfaceVariant }]}>
          {artist.bio}
        </Text>
      )}

      {artist.genres.length > 0 && (
        <View style={styles.chipRow}>
          {artist.genres.map(g => (
            <Chip key={g.key} compact mode="flat" style={styles.chip}>{g.genre}</Chip>
          ))}
        </View>
      )}

      {artist.playlists.length > 0 && (
        <View style={styles.section}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
            {t('artists.detail.appearsIn')}
          </Text>
          <View style={styles.chipRow}>
            {artist.playlists.map(p => (
              <Chip
                key={p.id}
                compact
                mode="outlined"
                style={styles.chip}
                onPress={() => navigation.navigate('PlaylistDetail', { playlistId: p.id })}
              >
                {p.title}
              </Chip>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 6 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { height: 26 },
  bio: { lineHeight: 18 },
  section: { marginTop: 2 },
});
