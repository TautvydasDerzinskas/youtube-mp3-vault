import {
  createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode,
} from 'react';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { NowPlaying } from '../pages/PlaylistsPage/types';

// Most queues (a playlist's own track list) are all from one playlist, so
// callers just pass PlaylistVideo[] and every track plays from `playlistId`.
// A queue that spans playlists — e.g. "similar songs", which pulls from
// across the whole library — tags each track with its own playlistId so
// next/prev/auto-advance stream from the right playlist per track.
export type QueueTrack = PlaylistVideo & { playlistId?: string };

interface PlayerContextType {
  nowPlaying: NowPlaying | null;
  nowPlayingVideo: PlaylistVideo | undefined;
  isAudioPlaying: boolean;
  setIsAudioPlaying: (playing: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  /**
   * Web Audio analyser wired to the shared <audio> element, for anything
   * that wants to react to what's currently playing (e.g. the sidebar's
   * glow effect) — null whenever nothing is playing, or if Web Audio isn't
   * available/failed to initialize. Deliberately NOT a per-frame number:
   * this object reference only changes on play/stop, so consumers pull
   * frequency data themselves in their own rAF loop instead of forcing
   * every context consumer in the app to re-render 60 times a second.
   */
  analyserNode: AnalyserNode | null;
  hasNext: boolean;
  hasPrevious: boolean;
  /**
   * `queue`, when given, is used verbatim as the play/next/previous order
   * instead of auto-fetching+sorting the whole playlist by position — e.g.
   * the playlist detail page passes its current genre-filtered track list so
   * next/prev/auto-advance stay within that filtered set.
   */
  handleTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: QueueTrack[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  handleTrackEnded: () => void;
  stopIfPlaylist: (playlistId: string) => void;
  handleClosePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

/**
 * Owns the single shared <audio> element and "now playing" state at the app
 * layout level (rather than per-page) so playback survives route changes.
 * The playable queue is resolved once, at the moment playback starts (either
 * from an explicit queue the caller hands in, or auto-fetched+sorted by
 * position otherwise) — not kept reactively in sync with the source
 * playlist — so it keeps working correctly after navigating away from
 * whatever page started it.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ playlistId: string; video: PlaylistVideo } | null>(null);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  // Web Audio's createMediaElementSource can only ever be called once per
  // <audio> element (throws on a second call), so this remembers the graph
  // per element to survive effect re-runs — most notably React StrictMode's
  // dev-only setup→cleanup→setup double-invoke, which would otherwise crash.
  const audioGraphRef = useRef<{ el: HTMLAudioElement; ctx: AudioContext; analyser: AnalyserNode } | null>(null);

  useEffect(() => {
    if (!current || !audioRef.current) return;
    audioRef.current.src = playlistsApi.streamUrl(current.playlistId, current.video.id);
    audioRef.current.play().catch(() => {});
  }, [current]);

  // Purely cosmetic (drives the sidebar's playback glow) — never allowed to
  // affect real playback, so every failure mode here just leaves the effect
  // off rather than throwing. Keyed on "is a session active" rather than on
  // `current` itself, so it sets up once per mini-player mount and survives
  // track-to-track changes within that session instead of tearing down and
  // recreating the AudioContext on every skip.
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

    setCurrent({ playlistId, video });
    if (queueOverride) {
      setQueue(queueOverride);
    } else {
      playlistsApi.getVideos(playlistId)
        .then(({ videos }) => setQueue(videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position)))
        .catch(() => setQueue([]));
    }
  }, []);

  const currentIndex = current ? queue.findIndex(v => v.id === current.video.id) : -1;
  const hasNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const hasPrevious = currentIndex > 0;

  const playNext = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      const idx = queue.findIndex(v => v.id === prev.video.id);
      const next = idx >= 0 ? queue[idx + 1] : undefined;
      return next ? { playlistId: next.playlistId ?? prev.playlistId, video: next } : prev;
    });
  }, [queue]);

  const playPrevious = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      const idx = queue.findIndex(v => v.id === prev.video.id);
      const previous = idx > 0 ? queue[idx - 1] : undefined;
      return previous ? { playlistId: previous.playlistId ?? prev.playlistId, video: previous } : prev;
    });
  }, [queue]);

  const handleTrackEnded = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      const idx = queue.findIndex(v => v.id === prev.video.id);
      const next = idx >= 0 ? queue[idx + 1] : undefined;
      return next ? { playlistId: next.playlistId ?? prev.playlistId, video: next } : null;
    });
  }, [queue]);

  const stopIfPlaylist = useCallback((playlistId: string) => {
    setCurrent(prev => (prev?.playlistId === playlistId ? null : prev));
  }, []);

  const handleClosePlayer = useCallback(() => {
    audioRef.current?.pause();
    setCurrent(null);
  }, []);

  const value: PlayerContextType = {
    nowPlaying: current ? { playlistId: current.playlistId, videoId: current.video.id } : null,
    nowPlayingVideo: current?.video,
    isAudioPlaying, setIsAudioPlaying, audioRef, analyserNode,
    hasNext, hasPrevious,
    handleTogglePlay, playNext, playPrevious, handleTrackEnded, stopIfPlaylist, handleClosePlayer,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
