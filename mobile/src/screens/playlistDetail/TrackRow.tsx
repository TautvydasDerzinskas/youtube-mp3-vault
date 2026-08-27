import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { playlistsApi, PlaylistVideo, CloseHqCandidate } from '../../api/playlists';
import { usePlayer, QueueTrack } from '../../contexts/PlayerContext';
import { formatDuration } from '../../utils/format';
import { TrackContextMenu } from '../../components/TrackContextMenu';
import { CloseHqCandidatesDialog } from '../../components/CloseHqCandidatesDialog';
import { showToast } from '../../utils/toast';

const STATUS_ICON: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: 'error' | 'onSurfaceVariant' | 'primary' }> = {
  failed: { icon: 'alert-circle-outline', color: 'error' },
  pending: { icon: 'timer-sand', color: 'onSurfaceVariant' },
  downloading: { icon: 'cloud-download-outline', color: 'primary' },
};

// 2s between polls — same cadence as web's TrackRow.
const SEARCH_POLL_INTERVAL_MS = 2000;

interface TrackRowProps {
  track: PlaylistVideo;
  // Fallback only — used when a row's own video doesn't carry a playlistId
  // (the single-playlist case, e.g. PlaylistDetailScreen). AllTracksScreen's
  // rows each carry their own via track.playlistId instead, since they span
  // multiple playlists — mirrors web's TrackRow.tsx exactly.
  playlistId?: string;
  queue: QueueTrack[];
  // Lets the caller drop a deleted track from its own local list immediately
  // — see TrackContextMenu's own doc comment. Optional: not every call site
  // holds mutable list state to update.
  onDeleted?: (videoId: string) => void;
  // Lets the caller patch this row's data in its own local list once a
  // "Search for HQ" run finishes — same rationale as onDeleted, but for an
  // update rather than a removal.
  onUpdated?: (video: PlaylistVideo) => void;
}

// Mirrors frontend/src/pages/PlaylistDetailPage/TrackRow.tsx — thumbnail,
// title/artist, duration, download-status icon, HQ badge, tap-to-navigate,
// long-press-for-menu (web's equivalent is right-click). No YouTube-link/
// MP3-download row actions (those are web-only affordances tied to browser
// behavior — opening an external link / triggering a file download reads
// differently on mobile, so left out of this pass).
export function TrackRow({ track, playlistId, queue, onDeleted, onUpdated }: TrackRowProps) {
  const theme = useTheme();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { nowPlaying, isAudioPlaying, handleTogglePlay } = usePlayer();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [closeCandidates, setCloseCandidates] = useState<CloseHqCandidate[]>([]);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const trackPlaylistId = track.playlistId ?? playlistId ?? '';
  const isCurrent = nowPlaying?.playlistId === trackPlaylistId && nowPlaying?.videoId === track.id;
  const isDone = track.downloadStatus === 'done';
  const status = STATUS_ICON[track.downloadStatus];

  // The "in progress" cue for Search for HQ — web's TrackRow gets a literal
  // rotating gradient ring (CSS conic-gradient has no RN equivalent without
  // a new native dependency this repo doesn't already have); a pulsing
  // opacity on a plain colored border reads just as clearly as "something's
  // happening" here and works for any row width without distortion.
  useEffect(() => {
    if (!searching) {
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [searching, pulseAnim]);
  const borderOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });

  // Shared tail end of both Search for HQ and Rename track — polls getVideo
  // (the same single-video endpoint TrackDetailScreen already uses) until
  // its searchingHq field flips back to false. `mode` only controls which
  // toast(s) fire — see web's TrackRow for the fuller version of this
  // comment.
  const pollForCompletion = (mode: 'search' | 'rename') => {
    const hadHq = track.hqFileDownloaded || track.betterQualityExists;
    const poll = async () => {
      try {
        const { video: fresh, searchingHq, closeHqCandidates } = await playlistsApi.getVideo(trackPlaylistId, track.id);
        if (searchingHq) {
          setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
          return;
        }
        setSearching(false);
        onUpdated?.(fresh);
        if (mode === 'rename') {
          showToast(t('playlists.videoList.trackRenamed', { title: fresh.title }));
        }
        const foundHq = fresh.hqFileDownloaded || fresh.betterQualityExists;
        if (foundHq && !hadHq) {
          showToast(t('playlists.videoList.hqFoundForTrack', { title: fresh.title }));
        } else if (mode === 'search' && !foundHq) {
          // Deezer/Qobuz/Tidal turning up real-but-unconfident results is a
          // richer signal than plain "nothing found" — offer them as
          // one-click rename suggestions instead of the plain toast.
          if (closeHqCandidates.length > 0) {
            setCloseCandidates(closeHqCandidates);
          } else {
            showToast(t('playlists.videoList.hqNotFoundForTrack', { title: fresh.title }));
          }
        }
      } catch {
        setSearching(false);
      }
    };
    setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
  };

  const handleDismissCloseCandidates = () => {
    setCloseCandidates([]);
    playlistsApi.dismissHqCandidates(trackPlaylistId, track.id).catch(() => {});
  };

  // Picking a suggestion is just a rename to that exact artist/title —
  // reuses the row's own rename lifecycle (pulsing border, disabled menu
  // actions, the "found"/"renamed" toasts from pollForCompletion above)
  // rather than any separate code path.
  const handleSelectCloseCandidate = async (artist: string, title: string) => {
    setCloseCandidates([]);
    try {
      await handleRename(artist, title);
    } catch {
      showToast(t('playlists.videoList.renameError'));
    }
  };

  // Fire-and-forget POST kicks the search off server-side, then polls for
  // completion — see pollForCompletion above.
  const handleSearchHq = async () => {
    if (isCurrent && isAudioPlaying) handleTogglePlay(trackPlaylistId, track, queue);

    setSearching(true);
    try {
      await playlistsApi.searchTrackHq(trackPlaylistId, track.id);
    } catch {
      showToast(t('playlists.videoList.searchHqError'));
      setSearching(false);
      return;
    }
    pollForCompletion('search');
  };

  // Called from RenameTrackDialog (via TrackContextMenu) — only awaits the
  // initial POST, not the background metadata/HQ-search follow-up it kicks
  // off, so the dialog can dismiss right away and let this row's own
  // pulsing border carry the rest of the "in progress" indicator (same one
  // Search for HQ uses). Rethrows on failure so the dialog can show the
  // error inline instead of dismissing.
  const handleRename = async (artist: string | null, title: string) => {
    if (isCurrent && isAudioPlaying) handleTogglePlay(trackPlaylistId, track, queue);

    setSearching(true);
    try {
      await playlistsApi.renameTrack(trackPlaylistId, track.id, artist, title);
    } catch (err) {
      setSearching(false);
      throw err;
    }
    pollForCompletion('rename');
  };

  return (
    <>
    <View style={styles.container}>
      <Pressable
        onPress={() => navigation.navigate('TrackDetail', { playlistId: trackPlaylistId, trackId: track.id })}
        onLongPress={(e) => setMenuPos({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
        style={styles.row}
      >
        <View style={styles.playSlot}>
          {isDone && (
            <Pressable onPress={() => handleTogglePlay(trackPlaylistId, track, queue)} disabled={searching} hitSlop={8}>
              <MaterialCommunityIcons
                name={isCurrent && isAudioPlaying ? 'pause' : 'play'}
                size={22}
                color={theme.colors.primary}
                style={searching ? styles.disabledIcon : undefined}
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
      {searching && (
        <Animated.View
          pointerEvents="none"
          style={[styles.searchBorder, { borderColor: theme.colors.primary, opacity: borderOpacity }]}
        />
      )}
    </View>
    <TrackContextMenu
      playlistId={trackPlaylistId}
      video={track}
      position={menuPos}
      onDismiss={() => setMenuPos(null)}
      onDeleted={onDeleted}
      searching={searching}
      onSearchHq={handleSearchHq}
      onRename={handleRename}
    />
    {closeCandidates.length > 0 && (
      <CloseHqCandidatesDialog
        video={track}
        candidates={closeCandidates}
        onDismiss={handleDismissCloseCandidates}
        onSelect={handleSelectCloseCandidate}
      />
    )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
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
  disabledIcon: { opacity: 0.4 },
  searchBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 2,
    borderRadius: 6,
  },
});
