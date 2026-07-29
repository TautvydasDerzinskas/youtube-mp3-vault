import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

interface NowPlaying {
  title: string;
}

interface PlayerContextType {
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  togglePlayPause: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

// Stub only — there's no real audio playback on mobile yet (no streaming,
// no expo-av/expo-audio wiring), unlike web's PlayerContext.tsx which drives
// an actual <audio> element. This exists purely so the bottom nav's middle
// button has real state to render against (idle logo vs play/pause) ahead
// of the actual player being built.
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [nowPlaying] = useState<NowPlaying | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const togglePlayPause = useCallback(() => {
    setIsAudioPlaying((prev) => !prev);
  }, []);

  return (
    <PlayerContext.Provider value={{ nowPlaying, isAudioPlaying, togglePlayPause }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
