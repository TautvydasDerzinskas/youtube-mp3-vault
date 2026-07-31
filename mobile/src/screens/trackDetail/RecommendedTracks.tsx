import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PlaylistVideo, RecommendedTrack } from '../../api/playlists';
import { usePlayer } from '../../contexts/PlayerContext';
import { formatDuration } from '../../utils/format';

interface RecommendedTracksProps {
  recommendations: RecommendedTrack[];
}

// Synthesizes a PlaylistVideo-shaped object from a RecommendedTrack so it
// can be passed to handleTogglePlay — mirrors web's RecommendedTracks.tsx
// toQueueTrack() helper (downloadStatus is always 'done' here since
// recommendations only ever surface already-downloaded library tracks).
function toPlaylistVideo(rec: RecommendedTrack): PlaylistVideo {
  return {
    id: rec.id, youtubeId: rec.youtubeId, title: rec.title, duration: rec.duration,
    thumbnailUrl: rec.thumbnailUrl, position: 0, isAvailable: true, downloadStatus: 'done',
    downloadError: null, fileSize: null, bitrate: null, addedAt: new Date().toISOString(),
    artist: rec.artist, album: null, trackNumber: null, genres: rec.genres, releaseYear: null,
    metadataStatus: 'found', playCount: rec.playCount, lastPlayedAt: null,
    betterQualityExists: false, hqFileDownloaded: false, playlistId: rec.playlistId,
  };
}

// Mirrors frontend/src/pages/TrackDetailPage/RecommendedTracks.tsx —
// "sounds like this" in-library similarity list.
export function RecommendedTracks({ recommendations }: RecommendedTracksProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  if (recommendations.length === 0) return null;

  const queue = recommendations.map(toPlaylistVideo);

  return (
    <View style={styles.section}>
      <Text variant="titleSmall" style={styles.sectionTitle}>{t('playlists.trackDetail.recommendedTitle')}</Text>
      {recommendations.map((rec, index) => {
        const isCurrent = nowPlaying?.playlistId === rec.playlistId && nowPlaying?.videoId === rec.id;
        return (
          <Pressable
            key={rec.id}
            style={styles.row}
            onPress={() => navigation.navigate('TrackDetail', { playlistId: rec.playlistId, trackId: rec.id })}
          >
            <Pressable onPress={() => handleTogglePlay(rec.playlistId, queue[index], queue)} hitSlop={8}>
              <MaterialCommunityIcons
                name={isCurrent && isAudioPlaying ? 'pause' : 'play'}
                size={20}
                color={theme.colors.primary}
              />
            </Pressable>
            {rec.thumbnailUrl ? (
              <Image source={{ uri: rec.thumbnailUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
                <MaterialCommunityIcons name="music-note" size={14} color={theme.colors.onSurfaceVariant} />
              </View>
            )}
            <View style={styles.text}>
              <Text numberOfLines={1} style={{ color: theme.colors.onBackground }}>{rec.title}</Text>
              {rec.artist && (
                <Text numberOfLines={1} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{rec.artist}</Text>
              )}
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{formatDuration(rec.duration)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  thumb: { width: 36, height: 36, borderRadius: 6 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
});
