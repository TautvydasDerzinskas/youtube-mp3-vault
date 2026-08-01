import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RemixResult } from '../../api/playlists';
import { formatDuration, youtubeWatchUrl } from '../../utils/format';

interface RemixLinksProps {
  state: RemixResult[] | 'loading' | 'error';
}

// Mirrors frontend/src/pages/TrackDetailPage/RemixLinks.tsx — external
// YouTube links only, never downloaded (see searchRemixes on the backend
// for the dedup logic). Same loading/empty contract as RecommendedTracks/
// DiscoverTracks: a bare spinner while loading, nothing at all once
// resolved if there's nothing to show.
export function RemixLinks({ state }: RemixLinksProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (state === 'loading') {
    return <View style={styles.loading}><ActivityIndicator size="small" /></View>;
  }
  if (state === 'error' || state.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text variant="titleSmall" style={styles.sectionTitle}>{t('playlists.trackDetail.remixesTitle')}</Text>
      {state.map((remix) => (
        <Pressable key={remix.id} style={styles.row} onPress={() => Linking.openURL(youtubeWatchUrl(remix.id))}>
          {remix.thumbnailUrl ? (
            <Image source={{ uri: remix.thumbnailUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
              <MaterialCommunityIcons name="music-note" size={14} color={theme.colors.onSurfaceVariant} />
            </View>
          )}
          <View style={styles.text}>
            <Text numberOfLines={1} style={{ color: theme.colors.onBackground }}>{remix.title}</Text>
            {remix.channelName && (
              <Text numberOfLines={1} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{remix.channelName}</Text>
            )}
          </View>
          {remix.duration != null && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatDuration(remix.duration)}</Text>
          )}
          <MaterialCommunityIcons name="youtube" size={18} color={theme.colors.onSurfaceVariant} style={styles.icon} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 16, alignItems: 'center' },
  section: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  thumb: { width: 36, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  icon: { marginLeft: 4 },
});
