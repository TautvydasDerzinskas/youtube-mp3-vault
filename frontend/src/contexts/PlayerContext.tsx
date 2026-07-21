import {
  createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { NowPlaying } from '../pages/PlaylistsPage/types';

export type QueueTrack = PlaylistVideo & { playlistId?: string };

// Caps how many previously-played tracks are remembered for shuffle's
// "Previous" button — only relevant in shuffle mode (sequential mode always
// derives "previous" from position in `queue` directly), bounded so a very
// long listening session doesn't grow this unboundedly.
const MAX_HISTORY = 50;

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
  const [isShuffle, setIsShuffle] = useState(false);
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
  const toggleShuffle = useCallback(() => setIsShuffle(v => !v), []);

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
