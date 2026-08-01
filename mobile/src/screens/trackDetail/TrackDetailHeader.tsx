import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Button, Chip, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PlaylistVideo, UsedInPlaylist } from '../../api/playlists';
import { usePlayer } from '../../contexts/PlayerContext';
import { formatDuration, formatGenre, normalizeGenreKey } from '../../utils/format';

interface TrackDetailHeaderProps {
  video: PlaylistVideo;
  playlistId: string;
  usedIn: UsedInPlaylist[] | 'loading' | 'error';
}

// Mirrors frontend/src/pages/TrackDetailPage/Header.tsx — big artwork,
// title/artist (clickable → ArtistDetail, same key-normalization as web's
// artistUrl: trim+lowercase, matching backend's normalizeKey), duration/
// play-count/release-year/genre chips, an "appears in" row of the other
// playlists this same track is also in, and a play button (queue omitted so
// PlayerContext falls back to the rest of the playlist, same as clicking a
// track row would).
export function TrackDetailHeader({ video, playlistId, usedIn }: TrackDetailHeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();

  const isPlayingThis = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === video.id && isAudioPlaying;

  return (
    <View style={styles.container}>
      {video.thumbnailUrl ? (
        <Image source={{ uri: video.thumbnailUrl }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.artworkFallback, { backgroundColor: theme.colors.elevation.level3 }]}>
          <MaterialCommunityIcons name="music-note" size={48} color={theme.colors.onSurfaceVariant} />
        </View>
      )}

      <Text variant="headlineSmall" style={styles.title}>{video.title}</Text>
      {video.artist && (
        <Pressable onPress={() => navigation.navigate('ArtistDetail', { key: video.artist!.trim().toLowerCase() })}>
          <Text variant="titleMedium" style={{ color: theme.colors.primary }}>{video.artist}</Text>
        </Pressable>
      )}

      <View style={styles.chipRow}>
        {video.duration != null && <Chip compact mode="outlined" style={styles.chip}>{formatDuration(video.duration)}</Chip>}
        {video.playCount > 0 && (
          <Chip compact mode="outlined" style={styles.chip}>{t('artists.detail.totalPlayCount', { count: video.playCount })}</Chip>
        )}
        {video.releaseYear && <Chip compact mode="outlined" style={styles.chip}>{video.releaseYear}</Chip>}
      </View>

      {video.genres.length > 0 && (
        <View style={styles.chipRow}>
          {video.genres.map(g => (
            <Chip
              key={g}
              compact
              mode="flat"
              style={styles.chip}
              onPress={() => navigation.navigate('AllTracks', { genreKey: normalizeGenreKey(g), genreLabel: formatGenre(g) })}
            >
              {g}
            </Chip>
          ))}
        </View>
      )}

      {usedIn === 'loading' ? null : usedIn !== 'error' && usedIn.length > 0 && (
        <View style={styles.usedInSection}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            {t('artists.detail.appearsIn')}
          </Text>
          <View style={styles.chipRow}>
            {usedIn.map((p) => (
              <Chip
                key={p.id}
                compact
                mode="outlined"
                style={styles.chip}
                onPress={() => navigation.navigate('PlaylistDetail', { playlistId: p.id })}
              >
                {p.title}
              </Chip>
            ))}
          </View>
        </View>
      )}

      {video.downloadStatus === 'done' ? (
        <Button
          mode="contained"
          icon={isPlayingThis ? 'pause' : 'play'}
          onPress={() => handleTogglePlay(playlistId, video)}
          style={styles.playButton}
        >
          {isPlayingThis ? t('playlists.videoList.pause') : t('playlists.videoList.play')}
        </Button>
      ) : (
        <Chip compact mode="flat" style={styles.playButton}>{t(`playlists.status.${video.downloadStatus}`)}</Chip>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 20, gap: 6 },
  artwork: { width: 160, height: 160, borderRadius: 12, marginBottom: 12 },
  artworkFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 },
  chip: { minHeight: 26 },
  usedInSection: { alignItems: 'center', marginTop: 12 },
  playButton: { marginTop: 16, alignSelf: 'center' },
});
