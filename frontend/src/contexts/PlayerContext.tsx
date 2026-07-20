import {
  createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode,
} from 'react';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { NowPlaying } from '../pages/PlaylistsPage/types';

export type QueueTrack = PlaylistVideo & { playlistId?: string };

interface PlayerContextType {
  nowPlaying: NowPlaying | null;
  nowPlayingVideo: PlaylistVideo | undefined;
  isAudioPlaying: boolean;
  setIsAudioPlaying: (playing: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  analyserNode: AnalyserNode | null;
  hasNext: boolean;
  hasPrevious: boolean;
  handleTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: QueueTrack[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  handleTrackEnded: () => void;
  stopIfPlaylist: (playlistId: string) => void;
  handleClosePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ playlistId: string; video: PlaylistVideo } | null>(null);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const audioGraphRef = useRef<{ el: HTMLAudioElement; ctx: AudioContext; analyser: AnalyserNode } | null>(null);

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
    const prev = currentRef.current;
    if (prev) playlistsApi.markPlayed(prev.playlistId, prev.video.id).catch(() => {});

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
