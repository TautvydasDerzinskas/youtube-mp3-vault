import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import { playlistsApi, getStreamSource, PlaylistVideo } from '../api/playlists';
import { nowPlayingApi } from '../api/nowPlaying';
import { useOfflineDownloads } from '../offline/OfflineDownloadsContext';
import { enqueuePlay, flushPlayQueue } from '../offline/playQueue';
import { shuffleStorage } from '../storage/shuffleStorage';

// How often to refresh the "now playing" heartbeat (see api/nowPlaying.ts)
// while a track is actively playing — comfortably under the backend's
// NOW_PLAYING_STALE_MS (60s, backend/src/routes/nowPlaying.ts).
const NOW_PLAYING_HEARTBEAT_MS = 25 * 1000;

interface PlaybackStatus {
  playing: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
}
const INITIAL_PLAYBACK_STATUS: PlaybackStatus = { playing: false, isBuffering: false, currentTime: 0, duration: 0 };

export type QueueTrack = PlaylistVideo & { playlistId?: string };

interface CurrentTrack {
  playlistId: string;
  video: PlaylistVideo;
}

interface NowPlaying {
  playlistId: string;
  videoId: string;
}

interface PlayerContextType {
  nowPlaying: NowPlaying | null;
  nowPlayingVideo: PlaylistVideo | undefined;
  isAudioPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  hasNext: boolean;
  hasPrevious: boolean;
  isRepeat: boolean;
  isShuffle: boolean;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  togglePlayPause: () => void;
  handleTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: QueueTrack[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  seekTo: (seconds: number) => void;
  handleClosePlayer: () => void;
  stopIfPlaylist: (playlistId: string) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

// Keeps history capped the same way web's PlayerContext.tsx does — a
// shuffle session realistically never needs to go back further than this.
const MAX_HISTORY = 50;

// Mirrors web's PlayerContext.tsx (handleTogglePlay/playNext/playPrevious/
// handleTrackEnded/queue/shuffle/repeat semantics — see that file's own
// comments for the shuffle-is-random-pick-not-real-shuffle and
// repeat-is-repeat-one-not-repeat-all behavior this replicates exactly),
// but backed by expo-audio's AudioPlayer instead of an HTMLAudioElement.
// One player instance is created once (via createAudioPlayer, not the
// useAudioPlayer hook, since it must outlive any single screen) and reused
// for the whole app session via .replace() when the track changes.
function pickNextTrack(fromVideo: PlaylistVideo, queue: QueueTrack[], shuffle: boolean): QueueTrack | undefined {
  if (queue.length === 0) return undefined;
  if (shuffle) {
    const candidates = queue.filter(v => v.id !== fromVideo.id);
    if (candidates.length === 0) return undefined;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  const idx = queue.findIndex(v => v.id === fromVideo.id);
  if (idx < 0 || idx >= queue.length - 1) return undefined;
  return queue[idx + 1];
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  if (!playerRef.current) {
    playerRef.current = createAudioPlayer(null, { updateInterval: 500 });
  }
  const player = playerRef.current;
  const { getLocalUri } = useOfflineDownloads();

  // Deliberately not expo-audio's useAudioPlayerStatus hook — that would
  // push a React state update (and, through context, re-render every single
  // usePlayer() consumer in the app) on every native tick, unconditionally.
  // shouldPlayInBackground below means Android/iOS keep this whole JS engine
  // alive while backgrounded so playback can continue, so an unconditional
  // 500ms re-render cascade would keep running the entire time the phone is
  // locked with music playing, for a screen nobody can see. This tracks the
  // same data via a manual listener instead (folded into the existing
  // playbackStatusUpdate subscription below, replacing what used to be two
  // separate subscriptions to the same event), and only actually pushes it
  // into React state while the app is foregrounded — see isForegroundRef.
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>(INITIAL_PLAYBACK_STATUS);
  const latestPlaybackStatusRef = useRef<PlaybackStatus>(INITIAL_PLAYBACK_STATUS);
  const isForegroundRef = useRef(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const resumed = next === 'active' && !isForegroundRef.current;
      isForegroundRef.current = next === 'active';
      // Catch up in one shot the moment the app comes back — lock-screen
      // controls stayed accurate natively the whole time regardless (see
      // setActiveForLockScreen), only this in-app UI (seek bar, play/pause
      // icons, etc.) was stale.
      if (resumed) setPlaybackStatus(latestPlaybackStatusRef.current);
    });
    return () => subscription.remove();
  }, []);

  const [current, setCurrentState] = useState<CurrentTrack | null>(null);
  const [queue, setQueueState] = useState<QueueTrack[]>([]);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);

  // Refs mirror the state above so callbacks below (mostly useCallback'd
  // with empty deps, and the playbackStatusUpdate listener subscribed once)
  // always read the latest value without needing to be recreated — same
  // shape as web's currentRef/locationRef pattern.
  const currentRef = useRef<CurrentTrack | null>(null);
  const queueRef = useRef<QueueTrack[]>([]);
  const isRepeatRef = useRef(false);
  const isShuffleRef = useRef(false);
  const historyRef = useRef<PlaylistVideo[]>([]);
  // "Now playing" broadcast state — deliberately driven off the
  // playbackStatusUpdate listener below rather than a React-state effect
  // (the pattern web's PlayerContext.tsx uses), since that listener is the
  // one thing here that keeps firing even while backgrounded (see
  // isForegroundRef above); a React-state-keyed effect would miss a pause
  // that happens via lock-screen controls while backgrounded, since
  // playbackStatus itself is only pushed into React state in the
  // foreground. nowPlayingKeyRef tracks which track (if any) was last
  // successfully reported, so a track change forces an immediate re-report
  // instead of waiting out the rest of the heartbeat interval.
  const nowPlayingKeyRef = useRef<string | null>(null);
  const nowPlayingHeartbeatAtRef = useRef(0);

  const setCurrent = useCallback((next: CurrentTrack | null) => {
    currentRef.current = next;
    setCurrentState(next);
  }, []);
  const setQueue = useCallback((next: QueueTrack[]) => {
    queueRef.current = next;
    setQueueState(next);
  }, []);

  // Restores the shuffle toggle from the last session so it comes back
  // pre-selected — SecureStore is async, so this can only update state after
  // the initial (false) render, same as loading any other persisted value.
  useEffect(() => {
    shuffleStorage.get().then(value => {
      if (value === 'true') {
        isShuffleRef.current = true;
        setIsShuffle(true);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      // Required for setActiveForLockScreen (below) to actually take effect.
      interruptionMode: 'doNotMix',
    }).catch(() => {});
    return () => {
      player.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads whatever `current` points at into the (single, persistent) player
  // whenever it changes to a genuinely different track — handleTogglePlay
  // below never calls setCurrent for a re-click of the already-loaded
  // track, so this never fires a redundant reload.
  useEffect(() => {
    if (!current) {
      player.pause();
      player.clearLockScreenControls();
      return;
    }
    let cancelled = false;
    (async () => {
      // A locally downloaded file (see mobile/src/offline/) is preferred
      // over network streaming whenever one exists — not just while
      // offline, since it's also the cheaper/faster path when at home. No
      // Authorization header needed: it's a plain file:// path on iOS or a
      // MediaLibrary content:// asset URI on Android, both already
      // accessible to this app without going through the backend at all.
      const localUri = getLocalUri(current.playlistId, current.video.id);
      const source = localUri ? { uri: localUri } : await getStreamSource(current.playlistId, current.video.id);
      if (cancelled) return;
      player.replace(source);
      player.play();
      player.setActiveForLockScreen(true, {
        title: current.video.title,
        artist: current.video.artist ?? undefined,
        artworkUrl: current.video.thumbnailUrl ?? undefined,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.playlistId, current?.video.id, player]);

  // handleTrackEnded needs the latest queue/repeat/shuffle on every call but
  // must be subscribed to the player's event emitter exactly once (not
  // re-subscribed every render) — so it's kept in a ref, refreshed every
  // render, and the actual addListener effect below only depends on
  // `player` (stable for the app's lifetime).
  const handleTrackEndedRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleTrackEndedRef.current = () => {
      const prev = currentRef.current;
      if (prev) {
        // Queued rather than sent directly — see mobile/src/offline/playQueue.ts.
        // Works the same whether online (flushes immediately) or offline
        // (persists until the next reconnect), so this one path covers both.
        enqueuePlay(prev.playlistId, prev.video.id);
        flushPlayQueue().catch(() => {});
      }
      if (isRepeatRef.current) {
        // Repeat-one — not native player.loop, so the enqueue above still
        // fires every loop exactly like web's repeat-one does.
        player.seekTo(0);
        player.play();
        return;
      }
      if (!prev) return;
      const next = pickNextTrack(prev.video, queueRef.current, isShuffleRef.current);
      if (next) {
        historyRef.current = [...historyRef.current, prev.video].slice(-MAX_HISTORY);
        setCurrent({ playlistId: next.playlistId ?? prev.playlistId, video: next });
      } else {
        setCurrent(null);
      }
    };
  });

  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (s) => {
      latestPlaybackStatusRef.current = {
        playing: s.playing, isBuffering: s.isBuffering, currentTime: s.currentTime, duration: s.duration,
      };
      if (isForegroundRef.current) {
        setPlaybackStatus(latestPlaybackStatusRef.current);
      }

      const track = currentRef.current;
      const trackKey = track ? `${track.playlistId}:${track.video.id}` : null;
      if (s.playing && track) {
        const now = Date.now();
        const trackChanged = nowPlayingKeyRef.current !== trackKey;
        if (trackChanged || now - nowPlayingHeartbeatAtRef.current >= NOW_PLAYING_HEARTBEAT_MS) {
          nowPlayingHeartbeatAtRef.current = now;
          nowPlayingKeyRef.current = trackKey;
          nowPlayingApi.set(track.playlistId, track.video.id).catch(() => {});
        }
      } else if (!s.playing && nowPlayingKeyRef.current !== null) {
        nowPlayingKeyRef.current = null;
        nowPlayingApi.clear().catch(() => {});
      }

      if (s.didJustFinish) handleTrackEndedRef.current();
    });
    return () => subscription.remove();
  }, [player]);

  const handleTogglePlay = useCallback((playlistId: string, video: PlaylistVideo, queueOverride?: QueueTrack[]) => {
    const prev = currentRef.current;
    const isCurrent = prev?.playlistId === playlistId && prev?.video.id === video.id;
    if (isCurrent) {
      if (player.playing) player.pause(); else player.play();
      return;
    }

    historyRef.current = [];
    setCurrent({ playlistId, video });
    if (queueOverride) {
      setQueue(queueOverride);
    } else {
      playlistsApi.getVideos(playlistId)
        .then(({ videos }) => setQueue(videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position)))
        .catch(() => setQueue([]));
    }
  }, [player, setCurrent, setQueue]);

  const togglePlayPause = useCallback(() => {
    if (!currentRef.current) return;
    if (player.playing) player.pause(); else player.play();
  }, [player]);

  const playNext = useCallback(() => {
    const prev = currentRef.current;
    if (!prev) return;
    const next = pickNextTrack(prev.video, queueRef.current, isShuffleRef.current);
    if (!next) return;
    historyRef.current = [...historyRef.current, prev.video].slice(-MAX_HISTORY);
    setCurrent({ playlistId: next.playlistId ?? prev.playlistId, video: next });
  }, [setCurrent]);

  const playPrevious = useCallback(() => {
    const prev = currentRef.current;
    if (!prev) return;
    if (isShuffleRef.current) {
      const history = historyRef.current;
      if (history.length === 0) return;
      const last = history[history.length - 1];
      historyRef.current = history.slice(0, -1);
      setCurrent({ playlistId: prev.playlistId, video: last });
    } else {
      const idx = queueRef.current.findIndex(v => v.id === prev.video.id);
      if (idx <= 0) return;
      setCurrent({ playlistId: prev.playlistId, video: queueRef.current[idx - 1] });
    }
  }, [setCurrent]);

  const seekTo = useCallback((seconds: number) => {
    player.seekTo(seconds);
  }, [player]);

  const handleClosePlayer = useCallback(() => {
    player.pause();
    setCurrent(null);
  }, [player, setCurrent]);

  const stopIfPlaylist = useCallback((playlistId: string) => {
    if (currentRef.current?.playlistId === playlistId) {
      player.pause();
      setCurrent(null);
    }
  }, [player, setCurrent]);

  const toggleRepeat = useCallback(() => {
    setIsRepeat(prev => {
      const next = !prev;
      isRepeatRef.current = next;
      return next;
    });
  }, []);
  const toggleShuffle = useCallback(() => {
    setIsShuffle(prev => {
      const next = !prev;
      isShuffleRef.current = next;
      shuffleStorage.set(next).catch(() => {});
      return next;
    });
  }, []);

  const currentIndex = current ? queue.findIndex(v => v.id === current.video.id) : -1;
  const hasNext = isShuffle ? queue.length > 1 : currentIndex >= 0 && currentIndex < queue.length - 1;
  const hasPrevious = isShuffle ? historyRef.current.length > 0 : currentIndex > 0;

  return (
    <PlayerContext.Provider
      value={{
        nowPlaying: current ? { playlistId: current.playlistId, videoId: current.video.id } : null,
        nowPlayingVideo: current?.video,
        isAudioPlaying: playbackStatus.playing,
        isBuffering: playbackStatus.isBuffering,
        currentTime: playbackStatus.currentTime,
        duration: playbackStatus.duration,
        hasNext, hasPrevious, isRepeat, isShuffle,
        toggleRepeat, toggleShuffle, togglePlayPause,
        handleTogglePlay, playNext, playPrevious, seekTo,
        handleClosePlayer, stopIfPlaylist,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
