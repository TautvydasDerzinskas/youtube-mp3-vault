import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Menu, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { GenreSortOption } from './useGenres';

interface GenresFilterBarProps {
  onSortChange: (sort: GenreSortOption) => void;
  query: string;
  onQueryChange: (query: string) => void;
}

const SORT_OPTIONS: { value: GenreSortOption; labelKey: string }[] = [
  { value: 'name-asc', labelKey: 'genres.sortNameAsc' },
  { value: 'name-desc', labelKey: 'genres.sortNameDesc' },
  { value: 'songCount-desc', labelKey: 'genres.sortSongCountDesc' },
  { value: 'songCount-asc', labelKey: 'genres.sortSongCountAsc' },
];

export function GenresFilterBar({ onSortChange, query, onQueryChange }: GenresFilterBarProps) {
  const { t } = useTranslation();
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <View style={styles.row}>
      <TextInput
        mode="outlined"
        dense
        placeholder={t('genres.searchPlaceholder')}
        value={query}
        onChangeText={onQueryChange}
        style={styles.search}
        left={<TextInput.Icon icon="magnify" />}
      />
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={<IconButton icon="sort" onPress={() => setMenuVisible(true)} />}
      >
        {SORT_OPTIONS.map(opt => (
          <Menu.Item
            key={opt.value}
            title={t(opt.labelKey)}
            onPress={() => { onSortChange(opt.value); setMenuVisible(false); }}
          />
        ))}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 4 },
  search: { flex: 1 },
});
