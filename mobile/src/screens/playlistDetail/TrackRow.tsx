import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PlaylistVideo } from '../../api/playlists';
import { usePlayer, QueueTrack } from '../../contexts/PlayerContext';
import { formatDuration } from '../../utils/format';

const STATUS_ICON: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: 'error' | 'onSurfaceVariant' | 'primary' }> = {
  failed: { icon: 'alert-circle-outline', color: 'error' },
  pending: { icon: 'timer-sand', color: 'onSurfaceVariant' },
  downloading: { icon: 'cloud-download-outline', color: 'primary' },
};

interface TrackRowProps {
  track: PlaylistVideo;
  // Fallback only — used when a row's own video doesn't carry a playlistId
  // (the single-playlist case, e.g. PlaylistDetailScreen). AllTracksScreen's
  // rows each carry their own via track.playlistId instead, since they span
  // multiple playlists — mirrors web's TrackRow.tsx exactly.
  playlistId?: string;
  queue: QueueTrack[];
}

// Mirrors frontend/src/pages/PlaylistDetailPage/TrackRow.tsx — thumbnail,
// title/artist, duration, download-status icon, HQ badge, tap-to-navigate.
// No YouTube-link/MP3-download row actions (those are web-only affordances
// tied to browser behavior — opening an external link / triggering a file
// download reads differently on mobile, so left out of this pass).
export function TrackRow({ track, playlistId, queue }: TrackRowProps) {
  const theme = useTheme();
  const navigation = useNavigation();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  const trackPlaylistId = track.playlistId ?? playlistId ?? '';
  const isCurrent = nowPlaying?.playlistId === trackPlaylistId && nowPlaying?.videoId === track.id;
  const isDone = track.downloadStatus === 'done';
  const status = STATUS_ICON[track.downloadStatus];

  return (
    <Pressable
      onPress={() => navigation.navigate('TrackDetail', { playlistId: trackPlaylistId, trackId: track.id })}
      style={styles.row}
    >
      <View style={styles.playSlot}>
        {isDone && (
          <Pressable onPress={() => handleTogglePlay(trackPlaylistId, track, queue)} hitSlop={8}>
            <MaterialCommunityIcons
              name={isCurrent && isAudioPlaying ? 'pause' : 'play'}
              size={22}
              color={theme.colors.primary}
            />
          </Pressable>
        )}
      </View>

      {track.thumbnailUrl ? (
        <Image source={{ uri: track.thumbnailUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
          <MaterialCommunityIcons name="music-note" size={16} color={theme.colors.onSurfaceVariant} />
        </View>
      )}

      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, { color: isCurrent ? theme.colors.primary : theme.colors.onBackground }]}>
          {track.title}
        </Text>
        {track.artist && (
          <Text numberOfLines={1} style={[styles.artist, { color: theme.colors.onSurfaceVariant }]}>{track.artist}</Text>
        )}
      </View>

      {track.hqFileDownloaded && (
        <MaterialCommunityIcons name="star" size={16} color={theme.colors.primary} style={styles.icon} />
      )}
      {!isDone && status && (
        <MaterialCommunityIcons
          name={status.icon}
          size={16}
          color={status.color === 'error' ? theme.colors.error : status.color === 'primary' ? theme.colors.primary : theme.colors.onSurfaceVariant}
          style={styles.icon}
        />
      )}
      <Text style={[styles.duration, { color: theme.colors.onSurfaceVariant }]}>
        {track.duration ? formatDuration(track.duration) : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  playSlot: { width: 24, alignItems: 'center' },
  thumb: { width: 40, height: 40, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 14 },
  artist: { fontSize: 12, marginTop: 1 },
  icon: { marginHorizontal: 2 },
  duration: { fontSize: 12, width: 40, textAlign: 'right' },
});
