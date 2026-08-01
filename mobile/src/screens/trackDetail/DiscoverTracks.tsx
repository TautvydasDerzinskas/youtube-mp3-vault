import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DiscoverResult } from '../../api/playlists';
import { formatDuration, youtubeWatchUrl } from '../../utils/format';

interface DiscoverTracksProps {
  state: DiscoverResult[] | 'loading' | 'error' | 'disabled';
}

// Mirrors frontend/src/pages/TrackDetailPage/DiscoverTracks.tsx — Last.fm-
// based "you might also like" results that aren't in the library, so
// there's nothing to play in-app: each row is an external link out (YouTube
// if a video was found, always a Spotify search as a fallback/alternative).
export function DiscoverTracks({ state }: DiscoverTracksProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (state === 'loading') {
    return <View style={styles.loading}><ActivityIndicator size="small" /></View>;
  }
  if (state === 'disabled' || state === 'error' || state.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text variant="titleSmall" style={styles.sectionTitle}>{t('playlists.trackDetail.discoverTitle')}</Text>
      {state.map((item, index) => (
        <Pressable
          key={`${item.artist}-${item.title}-${index}`}
          style={styles.row}
          onPress={() => item.youtubeId && Linking.openURL(youtubeWatchUrl(item.youtubeId))}
        >
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
              <MaterialCommunityIcons name="music-note" size={14} color={theme.colors.onSurfaceVariant} />
            </View>
          )}
          <View style={styles.text}>
            <Text numberOfLines={1} style={{ color: theme.colors.onBackground }}>{item.title}</Text>
            <Text numberOfLines={1} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{item.artist}</Text>
          </View>
          {item.duration != null && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatDuration(item.duration)}</Text>
          )}
          <Pressable
            onPress={(e) => { e.stopPropagation(); Linking.openURL(item.spotifySearchUrl); }}
            hitSlop={8}
            style={styles.iconButton}
            accessibilityLabel={t('playlists.trackDetail.openInSpotify')}
          >
            <MaterialCommunityIcons name="open-in-new" size={16} color={theme.colors.onSurfaceVariant} />
          </Pressable>
          {item.youtubeId && (
            <MaterialCommunityIcons name="youtube" size={18} color={theme.colors.onSurfaceVariant} style={styles.iconButton} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 16, alignItems: 'center' },
  section: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  thumb: { width: 36, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  iconButton: { marginLeft: 4 },
});
