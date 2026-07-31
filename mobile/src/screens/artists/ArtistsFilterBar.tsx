import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Menu, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { ArtistSortOption } from './useArtists';

interface ArtistsFilterBarProps {
  sort: ArtistSortOption;
  onSortChange: (sort: ArtistSortOption) => void;
  query: string;
  onQueryChange: (query: string) => void;
}

const SORT_OPTIONS: { value: ArtistSortOption; labelKey: string }[] = [
  { value: 'name-asc', labelKey: 'artists.sortNameAsc' },
  { value: 'name-desc', labelKey: 'artists.sortNameDesc' },
  { value: 'songCount-desc', labelKey: 'artists.sortSongCountDesc' },
  { value: 'songCount-asc', labelKey: 'artists.sortSongCountAsc' },
  { value: 'plays-desc', labelKey: 'artists.sortPlaysDesc' },
  { value: 'plays-asc', labelKey: 'artists.sortPlaysAsc' },
];

export function ArtistsFilterBar({ onSortChange, query, onQueryChange }: ArtistsFilterBarProps) {
  const { t } = useTranslation();
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <View style={styles.row}>
      <TextInput
        mode="outlined"
        dense
        placeholder={t('artists.searchPlaceholder')}
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
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 10, marginBottom: 4 },
  search: { flex: 1 },
});
