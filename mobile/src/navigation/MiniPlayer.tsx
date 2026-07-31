import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';
import { formatDuration } from '../utils/format';

// Content for BottomNav's drag-reveal panel (see PANEL_MAX_HEIGHT there) —
// mirrors web's MiniPlayer.tsx (thumbnail/title, seek bar, prev/play/next,
// repeat/shuffle, close) but with a real seek bar instead of a native
// <audio controls> widget, since RN has no equivalent to defer to. The
// audio-reactive glow web has (SidebarAudioGlow, Web Audio API AnalyserNode)
// has no RN equivalent and isn't ported.
export function MiniPlayer() {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const {
    nowPlaying, nowPlayingVideo, isAudioPlaying, isBuffering, currentTime, duration,
    hasNext, hasPrevious, isRepeat, isShuffle,
    toggleRepeat, toggleShuffle, togglePlayPause, playNext, playPrevious, seekTo, handleClosePlayer,
  } = usePlayer();

  if (!nowPlaying || !nowPlayingVideo) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>{t('player.nothingPlaying')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
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

      <View style={styles.seekRow}>
        <Text style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>{formatDuration(currentTime)}</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration || 1}
          value={currentTime}
          minimumTrackTintColor={theme.colors.primary}
          maximumTrackTintColor={theme.colors.outline}
          thumbTintColor={theme.colors.primary}
          onSlidingComplete={seekTo}
        />
        <Text style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>{formatDuration(duration)}</Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable onPress={toggleShuffle} hitSlop={8}>
          <MaterialCommunityIcons name="shuffle" size={20} color={isShuffle ? theme.colors.error : theme.colors.onSurfaceVariant} />
        </Pressable>
        <Pressable onPress={playPrevious} disabled={!hasPrevious} hitSlop={8}>
          <MaterialCommunityIcons name="skip-previous" size={26} color={hasPrevious ? theme.colors.onBackground : theme.colors.outlineVariant} />
        </Pressable>
        <Pressable onPress={togglePlayPause} style={[styles.playButton, { backgroundColor: theme.colors.primary }]}>
          {isBuffering ? (
            <ActivityIndicator size={16} color={theme.colors.onPrimary} />
          ) : (
            <MaterialCommunityIcons name={isAudioPlaying ? 'pause' : 'play'} size={22} color={theme.colors.onPrimary} />
          )}
        </Pressable>
        <Pressable onPress={playNext} disabled={!hasNext} hitSlop={8}>
          <MaterialCommunityIcons name="skip-next" size={26} color={hasNext ? theme.colors.onBackground : theme.colors.outlineVariant} />
        </Pressable>
        <Pressable onPress={toggleRepeat} hitSlop={8}>
          <MaterialCommunityIcons name="repeat" size={20} color={isRepeat ? theme.colors.error : theme.colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 4, justifyContent: 'center', gap: 2 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  thumb: { width: 36, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  trackText: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600' },
  artist: { fontSize: 11, marginTop: 1 },
  seekRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slider: { flex: 1, height: 28 },
  time: { fontSize: 10, width: 32, textAlign: 'center' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 2 },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
