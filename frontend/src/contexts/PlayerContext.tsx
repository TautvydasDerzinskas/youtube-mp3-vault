import {
  createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { nowPlayingApi } from '../api/nowPlaying';
import { NowPlaying } from '../pages/PlaylistsPage/types';

export type QueueTrack = PlaylistVideo & { playlistId?: string };

// Caps how many previously-played tracks are remembered for shuffle's
// "Previous" button — only relevant in shuffle mode (sequential mode always
// derives "previous" from position in `queue` directly), bounded so a very
// long listening session doesn't grow this unboundedly.
const MAX_HISTORY = 50;

// How often to refresh the "now playing" heartbeat (see api/nowPlaying.ts)
// while a track is actively playing — comfortably under the backend's
// NOW_PLAYING_STALE_MS (60s, routes/nowPlaying.ts) so a couple of missed
// beats don't make a still-playing track look stopped.
const NOW_PLAYING_HEARTBEAT_MS = 25 * 1000;

// Persists the shuffle toggle across sessions so it comes back pre-selected
// next time the app loads — mirrors mobile's shuffleStorage.ts.
const SHUFFLE_STORAGE_KEY = 'shuffle_mode';

// How much Cmd/Ctrl+Up/Down nudges volume per keypress (see the global
// shortcut effect below) — matches KeyboardShortcutsDialog's documented step.
const VOLUME_STEP = 0.1;

interface PlayerContextType {
  nowPlaying: NowPlaying | null;
  nowPlayingVideo: PlaylistVideo | undefined;
  isAudioPlaying: boolean;
  setIsAudioPlaying: (playing: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  analyserNode: AnalyserNode | null;
  hasNext: boolean;
  hasPrevious: boolean;
  isRepeat: boolean;
  isShuffle: boolean;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  handleTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: QueueTrack[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  handleTrackEnded: () => void;
  stopIfPlaylist: (playlistId: string) => void;
  handleClosePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ playlistId: string; video: PlaylistVideo; originPath: string } | null>(null);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(() => localStorage.getItem(SHUFFLE_STORAGE_KEY) === 'true');
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const audioGraphRef = useRef<{ el: HTMLAudioElement; ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  // Tracks played so far this session, oldest first — only consulted by
  // playPrevious in shuffle mode. Mutated exactly alongside a setCurrent
  // call, so reading historyRef.current directly at render time (for
  // hasPrevious below) is always up to date by the time that render happens.
  const historyRef = useRef<QueueTrack[]>([]);
  // Captures the page a new playback session started from (e.g. a specific
  // playlist vs. "All Tracks"), read at the exact moment handleTogglePlay
  // runs — i.e. while the user is still on that page — rather than at
  // provider-render time, since AppLayout (and this provider with it) stays
  // mounted across every route change.
  const locationRef = useRef('/playlists');
  locationRef.current = useLocation().pathname;

  useEffect(() => {
    if (!current || !audioRef.current) return;
    audioRef.current.src = playlistsApi.streamUrl(current.playlistId, current.video.id);
    audioRef.current.play().catch(() => {});
  }, [current]);

  // Enters this track into Listening History the instant it's picked, not
  // when it finishes (that's markPlayed/handleTrackEnded below) — keyed on
  // `current` the same way the effect above is, so it fires exactly once
  // per distinct track (a repeat-mode restart doesn't change `current`, so
  // it correctly doesn't re-bump this track's spot in the history list).
  useEffect(() => {
    if (!current) return;
    playlistsApi.markPlayStarted(current.playlistId, current.video.id).catch(() => {});
  }, [current]);

  useEffect(() => {
    if (!current) {
      document.title = 'YoutubeVault';
      return;
    }
    const { title, artist } = current.video;
    document.title = `YoutubeVault :: ${artist ? `${artist} - ${title}` : title}`;
  }, [current]);

  // Broadcasts "now playing" (see api/nowPlaying.ts) only while genuinely
  // playing, not merely loaded/paused — isAudioPlaying only flips true once
  // the <audio> element's own 'play' DOM event fires (see AppLayout.tsx),
  // so this can't report a track that's still buffering or that errored out
  // before playback actually started. Re-runs (clearing, then immediately
  // re-reporting) on every track change since `current` gets a new object
  // identity each time, and on pause/close since isAudioPlaying or `current`
  // itself changes — the cleanup below is what calls clear() in both cases,
  // so there's exactly one place that does. Repeat mode is the one case
  // that does neither: handleTrackEnded restarts the same audio element
  // in place without changing `current`, so this effect (and its interval)
  // just keeps running uninterrupted through the loop, correctly.
  useEffect(() => {
    if (!current || !isAudioPlaying) return;
    const { playlistId, video } = current;
    nowPlayingApi.set(playlistId, video.id).catch(() => {});
    const interval = setInterval(() => {
      nowPlayingApi.set(playlistId, video.id).catch(() => {});
    }, NOW_PLAYING_HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      nowPlayingApi.clear().catch(() => {});
    };
  }, [current, isAudioPlaying]);

  const isPlayingSession = Boolean(current);
  useEffect(() => {
    if (!isPlayingSession) return;
    const audioEl = audioRef.current;
    if (!audioEl) return;

    try {
      let graph = audioGraphRef.current;
      if (!graph || graph.el !== audioEl) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx: AudioContext = new AudioContextClass();
        const source = ctx.createMediaElementSource(audioEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        graph = { el: audioEl, ctx, analyser };
        audioGraphRef.current = graph;
      }
      if (graph.ctx.state === 'suspended') graph.ctx.resume().catch(() => {});
      setAnalyserNode(graph.analyser);
    } catch {
      setAnalyserNode(null);
    }

    return () => setAnalyserNode(null);
  }, [isPlayingSession]);

  const handleTogglePlay = useCallback((playlistId: string, video: PlaylistVideo, queueOverride?: QueueTrack[]) => {
    const prev = currentRef.current;
    const isCurrent = prev?.playlistId === playlistId && prev?.video.id === video.id;
    if (isCurrent) {
      if (audioRef.current?.paused) audioRef.current.play().catch(() => {});
      else audioRef.current?.pause();
      return;
    }

    // A deliberate pick of a specific track starts a fresh session —
    // carrying over "previous" history from whatever was playing before
    // wouldn't mean anything here.
    historyRef.current = [];
    setCurrent({ playlistId, video, originPath: locationRef.current });
    if (queueOverride) {
      setQueue(queueOverride);
    } else {
      playlistsApi.getVideos(playlistId)
        .then(({ videos }) => setQueue(videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position)))
        .catch(() => setQueue([]));
    }
  }, []);

  const currentIndex = current ? queue.findIndex(v => v.id === current.video.id) : -1;
  // Shuffle can always jump to *some* other track as long as one exists;
  // "previous" instead depends on whether there's any session history to
  // step back through, since shuffle order isn't just position ± 1.
  const hasNext = isShuffle ? queue.length > 1 : (currentIndex >= 0 && currentIndex < queue.length - 1);
  const hasPrevious = isShuffle ? historyRef.current.length > 0 : currentIndex > 0;

  // Shared by playNext and handleTrackEnded — sequential mode is just
  // idx+1; shuffle mode picks uniformly at random from every other track in
  // the queue.
  const pickNextTrack = useCallback((fromVideo: PlaylistVideo): QueueTrack | undefined => {
    if (isShuffle) {
      const candidates = queue.filter(v => v.id !== fromVideo.id);
      if (candidates.length === 0) return undefined;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    const idx = queue.findIndex(v => v.id === fromVideo.id);
    return idx >= 0 ? queue[idx + 1] : undefined;
  }, [queue, isShuffle]);

  const playNext = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      const next = pickNextTrack(prev.video);
      if (!next) return prev;
      historyRef.current = [...historyRef.current, { ...prev.video, playlistId: prev.playlistId }].slice(-MAX_HISTORY);
      return { playlistId: next.playlistId ?? prev.playlistId, video: next, originPath: prev.originPath };
    });
  }, [pickNextTrack]);

  const playPrevious = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      if (isShuffle) {
        const history = historyRef.current;
        if (history.length === 0) return prev;
        const previous = history[history.length - 1];
        historyRef.current = history.slice(0, -1);
        return { playlistId: previous.playlistId ?? prev.playlistId, video: previous, originPath: prev.originPath };
      }
      const idx = queue.findIndex(v => v.id === prev.video.id);
      const previous = idx > 0 ? queue[idx - 1] : undefined;
      return previous ? { playlistId: previous.playlistId ?? prev.playlistId, video: previous, originPath: prev.originPath } : prev;
    });
  }, [queue, isShuffle]);

  const handleTrackEnded = useCallback(() => {
    const prev = currentRef.current;
    if (prev) playlistsApi.markPlayed(prev.playlistId, prev.video.id).catch(() => {});

    // Repeat loops the same track — restart it directly rather than
    // advancing `current` (which isn't changing, so the src-setting effect
    // above wouldn't fire again on its own).
    if (isRepeat) {
      const audioEl = audioRef.current;
      if (audioEl) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {});
      }
      return;
    }

    setCurrent(prevState => {
      if (!prevState) return null;
      const next = pickNextTrack(prevState.video);
      if (!next) return null;
      historyRef.current = [...historyRef.current, { ...prevState.video, playlistId: prevState.playlistId }].slice(-MAX_HISTORY);
      return { playlistId: next.playlistId ?? prevState.playlistId, video: next, originPath: prevState.originPath };
    });
  }, [isRepeat, pickNextTrack]);

  const toggleRepeat = useCallback(() => setIsRepeat(v => !v), []);
  const toggleShuffle = useCallback(() => setIsShuffle(v => {
    const next = !v;
    localStorage.setItem(SHUFFLE_STORAGE_KEY, String(next));
    return next;
  }), []);

  // Global mini-player shortcuts (see UserMenu's KeyboardShortcutsDialog for
  // the user-facing list) — only active once a track is loaded, and ignored
  // while the user is typing in a text field so Space/Cmd+S etc. don't hijack
  // normal typing/browser-save behavior.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentRef.current) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (audioRef.current?.paused) audioRef.current.play().catch(() => {});
        else audioRef.current?.pause();
        return;
      }

      if (!e.metaKey && !e.ctrlKey) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          playPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          playNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (audioRef.current) audioRef.current.volume = Math.min(1, audioRef.current.volume + VOLUME_STEP);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (audioRef.current) audioRef.current.volume = Math.max(0, audioRef.current.volume - VOLUME_STEP);
          break;
        case 's':
        case 'S':
          e.preventDefault();
          toggleShuffle();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playNext, playPrevious, toggleShuffle]);

  const stopIfPlaylist = useCallback((playlistId: string) => {
    setCurrent(prev => (prev?.playlistId === playlistId ? null : prev));
  }, []);

  const handleClosePlayer = useCallback(() => {
    audioRef.current?.pause();
    setCurrent(null);
  }, []);

  const value: PlayerContextType = {
    nowPlaying: current ? { playlistId: current.playlistId, videoId: current.video.id, originPath: current.originPath } : null,
    nowPlayingVideo: current?.video,
    isAudioPlaying, setIsAudioPlaying, audioRef, analyserNode,
    hasNext, hasPrevious, isRepeat, isShuffle, toggleRepeat, toggleShuffle,
    handleTogglePlay, playNext, playPrevious, handleTrackEnded, stopIfPlaylist, handleClosePlayer,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
