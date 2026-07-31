import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Menu, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { SortOption } from './usePlaylistDetail';

interface FilterBarProps {
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

const SORT_OPTIONS: { value: SortOption; labelKey: string }[] = [
  { value: 'import-desc', labelKey: 'playlists.detail.sortImportDesc' },
  { value: 'import-asc', labelKey: 'playlists.detail.sortImportAsc' },
  { value: 'name-asc', labelKey: 'playlists.detail.sortNameAsc' },
  { value: 'name-desc', labelKey: 'playlists.detail.sortNameDesc' },
  { value: 'artist-asc', labelKey: 'playlists.detail.sortArtistAsc' },
  { value: 'artist-desc', labelKey: 'playlists.detail.sortArtistDesc' },
  { value: 'plays-desc', labelKey: 'playlists.detail.sortPlaysDesc' },
  { value: 'plays-asc', labelKey: 'playlists.detail.sortPlaysAsc' },
];

// Mirrors frontend/src/pages/PlaylistDetailPage/TrackFilterBar.tsx's sort +
// search — genre filter and the HQ-only toggle aren't ported yet.
export function FilterBar({ sort, onSortChange, searchQuery, onSearchQueryChange }: FilterBarProps) {
  const { t } = useTranslation();
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <View style={styles.row}>
      <TextInput
        mode="outlined"
        dense
        placeholder={t('playlists.detail.searchPlaceholder')}
        value={searchQuery}
        onChangeText={onSearchQueryChange}
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
