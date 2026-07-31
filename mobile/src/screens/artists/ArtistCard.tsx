import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArtistSummary } from '../../api/artists';
import { ArtistSortOption } from './useArtists';

interface ArtistCardProps {
  artist: ArtistSummary;
  sort: ArtistSortOption;
  onPress: () => void;
}

// Mirrors frontend/src/pages/ArtistsPage/index.tsx's tile — avatar, name,
// and a caption that toggles between play count and song count depending
// on whether the current sort is a plays-based one.
export function ArtistCard({ artist, sort, onPress }: ArtistCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
    >
      {artist.thumbnailUrl ? (
        <Image source={{ uri: artist.thumbnailUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
          <MaterialCommunityIcons name="music-note" size={24} color={theme.colors.onSurfaceVariant} />
        </View>
      )}
      <Text numberOfLines={1} style={[styles.name, { color: theme.colors.onBackground }]}>{artist.name}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {sort.startsWith('plays')
          ? t('dashboard.playCount', { count: artist.totalPlayCount })
          : t('dashboard.songCount', { count: artist.songCount })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  avatar: { width: 64, height: 64, borderRadius: 8 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600' },
});
