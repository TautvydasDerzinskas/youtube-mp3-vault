import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardGenre } from '../../api/dashboard';

interface GenreCardProps {
  genre: DashboardGenre;
  // Takes the genre's key+label rather than a plain () => void — see
  // ArtistCard's identical reasoning: a stable per-screen callback
  // reference is what lets memo() below actually skip re-rendering
  // untouched cards on every keystroke of GenresScreen's (client-side,
  // per-keystroke) search filter.
  onPress: (key: string, label: string) => void;
}

// Mirrors frontend/src/pages/GenresPage/index.tsx's tile — icon, name, song
// count. Wrapped in memo() for the same reason as ArtistCard.
export const GenreCard = memo(function GenreCard({ genre, onPress }: GenreCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => onPress(genre.key, genre.genre)}
      style={[styles.card, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
    >
      <View style={styles.iconRow}>
        <MaterialCommunityIcons name="tag-multiple" size={20} color={theme.colors.primary} />
      </View>
      <Text numberOfLines={1} style={[styles.name, { color: theme.colors.onBackground }]}>{genre.genre}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('dashboard.songCount', { count: genre.count })}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  iconRow: { flexDirection: 'row' },
  name: { fontSize: 14, fontWeight: '600' },
});
