import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface DashboardListCardProps<T> {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  items: T[];
  emptyText: string;
  onSeeMore: () => void;
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
}

// Full-width card used for Songs on Repeat / Top Artists / Top Genres (see
// DashboardScreen) — shared rather than one component per section since all
// three are identical apart from icon/title/row content, and the preview
// list here is always small (backend caps summary lists at 10/10/5), so a
// plain .map is fine — no FlatList virtualization needed. The "see more"
// screens (AllSongsScreen etc.) use FlatList instead, since those can run
// up to the backend's higher ceilings.
export function DashboardListCard<T>({ icon, title, items, emptyText, onSeeMore, keyExtractor, renderItem }: DashboardListCardProps<T>) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.card, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={icon} size={20} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.onBackground }]}>{title}</Text>
      </View>

      {items.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>{emptyText}</Text>
      ) : (
        items.map((item, index) => <View key={keyExtractor(item)}>{renderItem(item, index)}</View>)
      )}

      <Pressable onPress={onSeeMore} style={styles.seeMore}>
        <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{t('dashboard.seeMore')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    fontSize: 13,
    paddingVertical: 12,
  },
  seeMore: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 8,
  },
});
