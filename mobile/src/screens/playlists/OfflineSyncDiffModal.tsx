import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { OfflineDiff, OfflineDiffEntry, useOfflineDownloads } from '../../offline/OfflineDownloadsContext';

interface Props {
  playlistId: string;
  diff: OfflineDiff;
  onClose: () => void;
}

// Capped so a playlist with a large diff doesn't turn the dialog into a
// full-screen list — each bucket scrolls independently within this height
// instead. Dialog.Content itself isn't scrollable, so nesting a ScrollView
// per bucket here doesn't fight it for gesture ownership.
const LIST_MAX_HEIGHT = 110;

function DiffSection({ label, items }: { label: string; items: OfflineDiffEntry[] }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.colors.onSurface }]}>{label}</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {items.map((item) => (
          <Text
            key={item.trackId}
            numberOfLines={1}
            style={[styles.listItem, { color: theme.colors.onSurfaceVariant }]}
          >
            {item.title}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

// Shown from PlaylistRow's "⋮" menu — only when OfflineDownloadsContext's
// diffs map already has a non-empty entry for this playlist (see
// isDiffEmpty). Nothing is downloaded or deleted until Proceed is tapped;
// Cancel (or dismissing the dialog) leaves on-device files exactly as they
// were, same as not having opened this at all.
export function OfflineSyncDiffModal({ playlistId, diff, onClose }: Props) {
  const { t } = useTranslation();
  const { syncPlaylist } = useOfflineDownloads();
  const [applying, setApplying] = useState(false);

  const handleProceed = async () => {
    setApplying(true);
    try {
      await syncPlaylist(playlistId);
    } finally {
      setApplying(false);
      onClose();
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={applying ? () => {} : onClose}>
        <Dialog.Title>{t('playlists.offline.diffModal.title')}</Dialog.Title>
        <Dialog.Content>
          <DiffSection label={t('playlists.offline.diffModal.added', { count: diff.added.length })} items={diff.added} />
          <DiffSection label={t('playlists.offline.diffModal.removed', { count: diff.removed.length })} items={diff.removed} />
          <DiffSection label={t('playlists.offline.diffModal.updated', { count: diff.updated.length })} items={diff.updated} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose} disabled={applying}>{t('common.cancel')}</Button>
          <Button onPress={handleProceed} loading={applying}>{t('playlists.offline.diffModal.proceed')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  list: { maxHeight: LIST_MAX_HEIGHT },
  listContent: { gap: 2 },
  listItem: { fontSize: 12, paddingVertical: 1 },
});
