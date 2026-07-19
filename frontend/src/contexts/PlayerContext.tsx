import {
  createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode,
} from 'react';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { NowPlaying } from '../pages/PlaylistsPage/types';

interface PlayerContextType {
  nowPlaying: NowPlaying | null;
  nowPlayingVideo: PlaylistVideo | undefined;
  isAudioPlaying: boolean;
  setIsAudioPlaying: (playing: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  hasNext: boolean;
  hasPrevious: boolean;
  /**
   * `queue`, when given, is used verbatim as the play/next/previous order
   * instead of auto-fetching+sorting the whole playlist by position — e.g.
   * the playlist detail page passes its current genre-filtered track list so
   * next/prev/auto-advance stay within that filtered set.
   */
  handleTogglePlay: (playlistId: string, video: PlaylistVideo, queue?: PlaylistVideo[]) => void;
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
  const [queue, setQueue] = useState<PlaylistVideo[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (!current || !audioRef.current) return;
    audioRef.current.src = playlistsApi.streamUrl(current.playlistId, current.video.id);
    audioRef.current.play().catch(() => {});
  }, [current]);

  const handleTogglePlay = useCallback((playlistId: string, video: PlaylistVideo, queueOverride?: PlaylistVideo[]) => {
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
      return next ? { playlistId: prev.playlistId, video: next } : prev;
    });
  }, [queue]);

  const playPrevious = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      const idx = queue.findIndex(v => v.id === prev.video.id);
      const previous = idx > 0 ? queue[idx - 1] : undefined;
      return previous ? { playlistId: prev.playlistId, video: previous } : prev;
    });
  }, [queue]);

  const handleTrackEnded = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      const idx = queue.findIndex(v => v.id === prev.video.id);
      const next = idx >= 0 ? queue[idx + 1] : undefined;
      return next ? { playlistId: prev.playlistId, video: next } : null;
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
    isAudioPlaying, setIsAudioPlaying, audioRef,
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
