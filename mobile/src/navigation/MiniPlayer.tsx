import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';

// Content for BottomNav's drag-reveal panel (see PANEL_MAX_HEIGHT there) —
// just the track info (thumbnail/title/artist) and a close button now. The
// seek bar lives permanently in BottomNav itself (pinned just above the tab
// row, visible whether this panel is open or not), and the transport row
// (prev/play/next/shuffle/repeat) was dropped entirely in favor of the
// pop-up controls BottomNav shows in place of its outer tab icons while this
// panel is open — this component no longer needs its own copy of either.
export function MiniPlayer() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { nowPlaying, nowPlayingVideo, handleClosePlayer } = usePlayer();

  if (!nowPlaying || !nowPlayingVideo) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>{t('player.nothingPlaying')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.trackInfo}
        onPress={() => navigation.navigate('TrackDetail', { playlistId: nowPlaying.playlistId, trackId: nowPlaying.videoId })}
      >
        {nowPlayingVideo.thumbnailUrl ? (
          <Image source={{ uri: nowPlayingVideo.thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
            <MaterialCommunityIcons name="music-note" size={16} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
        <View style={styles.trackText}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onBackground }]}>{nowPlayingVideo.title}</Text>
          {nowPlayingVideo.artist && (
            <Text numberOfLines={1} style={[styles.artist, { color: theme.colors.onSurfaceVariant }]}>{nowPlayingVideo.artist}</Text>
          )}
        </View>
      </Pressable>
      <Pressable onPress={handleClosePlayer} hitSlop={8}>
        <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // alignItems: 'flex-end' (rather than 'center') anchors this row to the
  // bottom of MiniPlayer's flex:1 box — right above the time labels/seek bar
  // that follow — so paddingBottom alone controls that gap, independent of
  // however much space ends up above (which no longer has to match it).
  container: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  trackInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  thumb: { width: 44, height: 44, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  trackText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600' },
  artist: { fontSize: 12, marginTop: 2 },
});
