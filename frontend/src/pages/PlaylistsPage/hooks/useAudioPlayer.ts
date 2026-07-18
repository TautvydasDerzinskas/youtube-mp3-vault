import { useEffect, useRef, useState } from 'react';
import { playlistsApi, PlaylistVideo } from '../../../api/youtube';
import { NowPlaying, VideoState } from '../types';

/**
 * Owns the single shared <audio> element and "now playing" state. Acts as a
 * playlist: handleTrackEnded advances to the next synced (downloaded) video
 * in the same playlist, in position order, using the caller's video cache.
 */
export function useAudioPlayer(videoCache: Record<string, VideoState>) {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Load + play whenever the "now playing" track changes (initial play, skip-to-next, …)
  useEffect(() => {
    if (!nowPlaying || !audioRef.current) return;
    audioRef.current.src = playlistsApi.streamUrl(nowPlaying.playlistId, nowPlaying.videoId);
    audioRef.current.play().catch(() => {});
  }, [nowPlaying]);

  const handleTogglePlay = (playlistId: string, video: PlaylistVideo) => {
    const isCurrent = nowPlaying?.playlistId === playlistId && nowPlaying?.videoId === video.id;
    if (isCurrent) {
      if (audioRef.current?.paused) audioRef.current.play().catch(() => {});
      else audioRef.current?.pause();
    } else {
      setNowPlaying({ playlistId, videoId: video.id });
    }
  };

  const handleTrackEnded = () => {
    setNowPlaying(current => {
      if (!current) return null;
      const videos = videoCache[current.playlistId];
      if (!Array.isArray(videos)) return null;
      const playable = videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position);
      const idx = playable.findIndex(v => v.id === current.videoId);
      const next = idx >= 0 ? playable[idx + 1] : undefined;
      return next ? { playlistId: current.playlistId, videoId: next.id } : null;
    });
  };

  /** Stop playback if the given playlist is the one currently playing — e.g. on delete. */
  const stopIfPlaylist = (playlistId: string) => {
    setNowPlaying(current => (current?.playlistId === playlistId ? null : current));
  };

  /** Stop playback entirely and dismiss the mini player. */
  const handleClosePlayer = () => {
    audioRef.current?.pause();
    setNowPlaying(null);
  };

  const nowPlayingVideo = nowPlaying
    ? (videoCache[nowPlaying.playlistId] as PlaylistVideo[] | undefined)?.find(v => v.id === nowPlaying.videoId)
    : undefined;

  return {
    nowPlaying, isAudioPlaying, setIsAudioPlaying, audioRef,
    handleTogglePlay, handleTrackEnded, stopIfPlaylist, handleClosePlayer, nowPlayingVideo,
  };
}
