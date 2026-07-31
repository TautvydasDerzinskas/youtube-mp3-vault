import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chip, IconButton, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { playlistsApi, Playlist } from '../../api/playlists';
import { formatBytes, formatPlaybackTime } from '../../utils/format';

interface AllTracksListItemProps {
  // Re-fetches the summary whenever this changes — same trigger web's
  // AllTracksListItem.tsx uses (the playlists array usePlaylists() tracks,
  // a fresh reference on every add/delete/rename/sync-poll tick), so this
  // row stays in sync with exactly the same events that update the real
  // rows above it.
  refreshOn: Playlist[];
}

// A fixed, always-present entry pointing at AllTracksScreen — not a real
// playlist, so no rename/delete/sync actions and no sync-status chips
// apply here; only the track count and total playback time, and (unlike
// real rows) no play-first button either — mirrors web's
// AllTracksListItem.tsx exactly.
export function AllTracksListItem({ refreshOn }: AllTracksListItemProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const [summary, setSummary] = useState<{ songCount: number; totalDurationSec: number; totalSize: number } | null>(null);

  useEffect(() => {
    playlistsApi.getAllTracksSummary().then(setSummary).catch(() => {});
  }, [refreshOn]);

  if (!summary) return null;

  const open = () => navigation.navigate('AllTracks');

  return (
    <Pressable
      onPress={open}
      style={[styles.row, { borderColor: theme.colors.outline, backgroundColor: theme.colors.elevation.level1 }]}
    >
      <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
        <MaterialCommunityIcons name="music-note" size={18} color={theme.colors.onSurfaceVariant} />
      </View>

      <View style={styles.info}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>
          {t('playlists.allTracks.title')}
        </Text>
        {summary.totalDurationSec > 0 && (
          <Text numberOfLines={1} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formatPlaybackTime(summary.totalDurationSec, t)} · {t('playlists.allTracks.sourcedFromYoutube')}
          </Text>
        )}
        <View style={styles.chipRow}>
          <Chip compact mode="outlined" style={styles.chip}>
            {t('playlists.detail.trackCount', { count: summary.songCount })}
          </Chip>
          {summary.totalSize > 0 && (
            <Chip compact mode="outlined" style={styles.chip}>{formatBytes(summary.totalSize)}</Chip>
          )}
        </View>
      </View>

      <IconButton icon="chevron-right" onPress={open} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  thumb: { width: 48, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { minHeight: 24 },
});
