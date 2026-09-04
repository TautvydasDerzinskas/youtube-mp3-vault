import {
  createContext, useContext, useEffect, useCallback, useRef, useState, ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { nowPlayingApi } from '../api/nowPlaying';
import { playbackStateApi, PersistedQueueEntry } from '../api/playbackState';
import { NowPlaying } from '../pages/PlaylistsPage/types';
import { useToast } from './ToastContext';

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
  // Increments on every explicit playNext/playPrevious — see its own
  // declaration in PlayerProvider for why callers should treat this (not
  // `nowPlaying` itself) as the "should I scroll to it?" signal.
  skipSignal: number;
  isAudioPlaying: boolean;
  setIsAudioPlaying: (playing: boolean) => void;
  handlePause: () => void;
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
  toggleFavourite: () => void;
  // Set once markPlayed's response comes back after a natural completion —
  // a one-shot broadcast (not part of `current`/`nowPlaying`, which describe
  // the *next* track by then) that TrackRow reads to animate its own Plays
  // counter when this is the track it's rendering. Identity changes on every
  // broadcast (see handleTrackEnded) so a row can tell a fresh bump apart
  // from the same object lingering in context, even if playCount is unchanged.
  justPlayedBump: { videoId: string; playCount: number } | null;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showSuccess } = useToast();
  const [current, setCurrent] = useState<{ playlistId: string; video: PlaylistVideo; originPath: string } | null>(null);
  // Bumped only by an explicit playNext/playPrevious (mini player buttons or
  // their keyboard shortcuts) — never by handleTrackEnded's own automatic
  // advance. PlaylistDetailPage/AllTracksPage watch this to scroll their
  // track list to the new current track on a deliberate skip, while leaving
  // a track ending on its own alone — jumping the list out from under
  // someone who's mid-scroll reading it would be far more disruptive than
  // useful for something they didn't ask for.
  const [skipSignal, setSkipSignal] = useState(0);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isRepeat, setIsRepeat] = useState(false);
  const [justPlayedBump, setJustPlayedBump] = useState<{ videoId: string; playCount: number } | null>(null);
  const [isShuffle, setIsShuffle] = useState(() => localStorage.getItem(SHUFFLE_STORAGE_KEY) === 'true');
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  // Mirror isShuffle/isRepeat into refs (same rationale as currentRef) so
  // the playbackState save calls sprinkled through this file can always
  // read the latest value without needing to be in every callback's
  // dependency array — keeps those callbacks' identities stable, same as
  // before this feature existed.
  const isShuffleRef = useRef(isShuffle);
  isShuffleRef.current = isShuffle;
  const isRepeatRef = useRef(isRepeat);
  isRepeatRef.current = isRepeat;
  const audioGraphRef = useRef<{ el: HTMLAudioElement; ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  // Set (with the saved seek position) by the restore-on-mount effect just
  // before it calls setCurrent — tells the src-setting effect below to skip
  // autoplay and instead seek once metadata loads, and tells the
  // markPlayStarted effect to skip re-bumping Listening History. Cleared by
  // whichever of those two effects runs second in the same commit (see
  // their comments) — declaration order below is load-bearing here.
  const isRestoringRef = useRef(false);
  const restorePositionRef = useRef(0);
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
  // `current` gets a new object identity on every setCurrent call, including
  // toggleFavourite's in-place patch of current.video.isFavourite above —
  // that's not an actual track change, so effects below that should only
  // fire when the track itself changes (reloading/restarting the <audio>
  // element, re-bumping Listening History, re-broadcasting "now playing")
  // key on this instead of `current` directly. Its own dependents still read
  // the fresh `current`/`video` via closure when they do fire — playlistId/
  // video.id (all any of them actually need) are exactly what make up this
  // key, so they're never stale relative to it.
  const currentTrackKey = current ? `${current.playlistId}:${current.video.id}` : null;

  useEffect(() => {
    if (!current || !audioRef.current) return;
    const audioEl = audioRef.current;
    audioEl.src = playlistsApi.streamUrl(current.playlistId, current.video.id);
    // A cross-device resume (see the restore-on-mount effect below) loads
    // the track paused at its saved position instead of autoplaying —
    // browsers block autoplay-with-sound anyway, but this makes it explicit
    // rather than relying on that as the only guard.
    if (isRestoringRef.current) {
      const seekTo = restorePositionRef.current;
      const handleLoadedMetadata = () => { audioEl.currentTime = seekTo; };
      audioEl.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      return () => audioEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }
    audioEl.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackKey]);

  // Enters this track into Listening History the instant it's picked, not
  // when it finishes (that's markPlayed/handleTrackEnded below) — keyed on
  // currentTrackKey the same way the effect above is, so it fires exactly
  // once per distinct track (neither a repeat-mode restart nor a favourite
  // toggle changes currentTrackKey, so it correctly doesn't re-bump this
  // track's spot in the history list). A restored-but-not-yet-played session
  // shouldn't count as a play either —
  // this is also where isRestoringRef gets cleared (see its declaration;
  // this effect runs after the src-setting effect above in the same commit,
  // so it's the correct place to consume-and-clear it).
  useEffect(() => {
    if (!current) return;
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    playlistsApi.markPlayStarted(current.playlistId, current.video.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackKey]);

  // Cross-device resume: on mount, pull whatever playback state was last
  // saved (see the save call sites throughout this file) and hydrate the
  // mini player from it — paused, at the saved position — so closing the
  // tab and opening the app elsewhere picks up where it left off. Runs
  // once; if there's nothing saved (or the account has never played
  // anything), playbackStateApi.get() resolves to null and this is a no-op.
  useEffect(() => {
    playbackStateApi.get().then(async (state) => {
      if (!state) return;
      const { videos } = await playlistsApi.getAllTracks();
      const byId = new Map(videos.map(v => [v.id, v]));
      // Tracks deleted since the state was saved simply aren't in this map
      // (getAllTracks already excludes unavailable/removed rows) — dropping
      // them here is just a lookup miss, no extra filtering needed.
      const hydrate = (entries: PersistedQueueEntry[]): QueueTrack[] =>
        entries.map(e => byId.get(e.videoId)).filter((v): v is PlaylistVideo => Boolean(v));

      const currentVideo = byId.get(state.videoId);
      // The resumed track itself was deleted — nothing sensible to restore.
      if (!currentVideo) return;

      historyRef.current = hydrate(state.history);
      setQueue(hydrate(state.queue));
      setIsShuffle(state.isShuffle);
      setIsRepeat(state.isRepeat);
      localStorage.setItem(SHUFFLE_STORAGE_KEY, String(state.isShuffle));
      isRestoringRef.current = true;
      restorePositionRef.current = state.positionSeconds;
      setCurrent({ playlistId: state.playlistId, video: currentVideo, originPath: state.originPath });
    }).catch(() => {});
    // Mount-only — intentionally not re-running on any dependency change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!current) {
      document.title = 'YoutubeVault';
      return;
    }
    const { title, artist } = current.video;
    document.title = `${artist ? `${artist} - ${title}` : title} - YoutubeVault`;
  }, [current]);

  // Broadcasts "now playing" (see api/nowPlaying.ts) only while genuinely
  // playing, not merely loaded/paused — isAudioPlaying only flips true once
  // the <audio> element's own 'play' DOM event fires (see AppLayout.tsx),
  // so this can't report a track that's still buffering or that errored out
  // before playback actually started. Re-runs (clearing, then immediately
  // re-reporting) on every track change since currentTrackKey changes, and
  // on pause/close since isAudioPlaying or currentTrackKey itself changes —
  // the cleanup below is what calls clear() in both cases, so there's
  // exactly one place that does. Repeat mode and a favourite toggle are the
  // cases that do neither: handleTrackEnded restarts the same audio element
  // in place and toggleFavourite only patches current.video.isFavourite,
  // neither of which changes currentTrackKey, so this effect (and its
  // interval) just keeps running uninterrupted through either, correctly.
  useEffect(() => {
    if (!current || !isAudioPlaying) return;
    const { playlistId, video, originPath } = current;
    // Also saves the resume position on the same cadence — reuses this
    // interval rather than adding a second one. Reads isShuffle/isRepeat via
    // ref (not as effect deps) so toggling either mid-playback doesn't tear
    // down and restart this interval (and the nowPlaying broadcast with it).
    const heartbeat = () => {
      nowPlayingApi.set(playlistId, video.id).catch(() => {});
      playbackStateApi.save({
        playlistId, videoId: video.id, positionSeconds: audioRef.current?.currentTime ?? 0,
        isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath,
      }).catch(() => {});
    };
    heartbeat();
    const interval = setInterval(heartbeat, NOW_PLAYING_HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      nowPlayingApi.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackKey, isAudioPlaying]);

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
    const originPath = locationRef.current;
    setCurrent({ playlistId, video, originPath });

    // Session-start save: the one call site that sends the full queue (an
    // empty history, since this is a fresh session) — every other save
    // call below only sends the lightweight fields and lets the backend
    // keep the previously-saved queue.
    const saveSession = (sessionQueue: QueueTrack[]) => {
      playbackStateApi.save({
        playlistId, videoId: video.id, positionSeconds: 0,
        isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath,
        queue: sessionQueue.map((v): PersistedQueueEntry => ({ playlistId: v.playlistId ?? playlistId, videoId: v.id })),
        history: [],
      }).catch(() => {});
    };

    if (queueOverride) {
      setQueue(queueOverride);
      saveSession(queueOverride);
    } else {
      playlistsApi.getVideos(playlistId)
        .then(({ videos }) => {
          const sorted = videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position);
          setQueue(sorted);
          saveSession(sorted);
        })
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

  // playNext/playPrevious read currentRef.current directly (rather than a
  // setCurrent functional updater) so the playbackState save below — which
  // needs the *resolved* next track and history — has a clean, synchronous
  // value to read right after, with no closure/updater-timing to reason
  // about. Matches handleTogglePlay's existing style above.
  const playNext = useCallback(() => {
    const prev = currentRef.current;
    if (!prev) return;
    const next = pickNextTrack(prev.video);
    if (!next) return;
    historyRef.current = [...historyRef.current, { ...prev.video, playlistId: prev.playlistId }].slice(-MAX_HISTORY);
    const playlistId = next.playlistId ?? prev.playlistId;
    setCurrent({ playlistId, video: next, originPath: prev.originPath });
    setSkipSignal(s => s + 1);
    playbackStateApi.save({
      playlistId, videoId: next.id, positionSeconds: 0,
      isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath: prev.originPath,
      history: historyRef.current.map((v): PersistedQueueEntry => ({ playlistId: v.playlistId ?? playlistId, videoId: v.id })),
    }).catch(() => {});
  }, [pickNextTrack]);

  const playPrevious = useCallback(() => {
    const prev = currentRef.current;
    if (!prev) return;
    let target: QueueTrack | undefined;
    if (isShuffle) {
      const history = historyRef.current;
      if (history.length === 0) return;
      target = history[history.length - 1];
      historyRef.current = history.slice(0, -1);
    } else {
      const idx = queue.findIndex(v => v.id === prev.video.id);
      target = idx > 0 ? queue[idx - 1] : undefined;
    }
    if (!target) return;
    const playlistId = target.playlistId ?? prev.playlistId;
    setCurrent({ playlistId, video: target, originPath: prev.originPath });
    setSkipSignal(s => s + 1);
    playbackStateApi.save({
      playlistId, videoId: target.id, positionSeconds: 0,
      isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath: prev.originPath,
      history: historyRef.current.map((v): PersistedQueueEntry => ({ playlistId: v.playlistId ?? playlistId, videoId: v.id })),
    }).catch(() => {});
  }, [queue, isShuffle]);

  const handleTrackEnded = useCallback(() => {
    const prev = currentRef.current;
    if (prev) {
      const videoId = prev.video.id;
      playlistsApi.markPlayed(prev.playlistId, videoId)
        .then(({ playCount }) => setJustPlayedBump({ videoId, playCount }))
        .catch(() => {});
    }

    // Repeat loops the same track — restart it directly rather than
    // advancing `current` (which isn't changing, so the src-setting effect
    // above wouldn't fire again on its own).
    if (isRepeat) {
      const audioEl = audioRef.current;
      if (audioEl) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {});
      }
      if (prev) {
        playbackStateApi.save({
          playlistId: prev.playlistId, videoId: prev.video.id, positionSeconds: 0,
          isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath: prev.originPath,
        }).catch(() => {});
      }
      return;
    }

    if (!prev) return;
    const next = pickNextTrack(prev.video);
    if (!next) {
      // Queue exhausted, nothing next — playback genuinely ends, so clear
      // the persisted state too rather than leaving a stale resume point.
      setCurrent(null);
      playbackStateApi.clear().catch(() => {});
      return;
    }
    historyRef.current = [...historyRef.current, { ...prev.video, playlistId: prev.playlistId }].slice(-MAX_HISTORY);
    const playlistId = next.playlistId ?? prev.playlistId;
    setCurrent({ playlistId, video: next, originPath: prev.originPath });
    playbackStateApi.save({
      playlistId, videoId: next.id, positionSeconds: 0,
      isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath: prev.originPath,
      history: historyRef.current.map((v): PersistedQueueEntry => ({ playlistId: v.playlistId ?? playlistId, videoId: v.id })),
    }).catch(() => {});
  }, [isRepeat, pickNextTrack]);

  const toggleRepeat = useCallback(() => setIsRepeat(v => {
    const next = !v;
    const cur = currentRef.current;
    if (cur) {
      playbackStateApi.save({
        playlistId: cur.playlistId, videoId: cur.video.id,
        positionSeconds: audioRef.current?.currentTime ?? 0,
        isShuffle: isShuffleRef.current, isRepeat: next, originPath: cur.originPath,
      }).catch(() => {});
    }
    return next;
  }), []);
  const toggleShuffle = useCallback(() => setIsShuffle(v => {
    const next = !v;
    localStorage.setItem(SHUFFLE_STORAGE_KEY, String(next));
    const cur = currentRef.current;
    if (cur) {
      playbackStateApi.save({
        playlistId: cur.playlistId, videoId: cur.video.id,
        positionSeconds: audioRef.current?.currentTime ?? 0,
        isShuffle: next, isRepeat: isRepeatRef.current, originPath: cur.originPath,
      }).catch(() => {});
    }
    return next;
  }), []);

  // Saves the exact pause position deterministically (unlike leaning on the
  // heartbeat effect's cleanup, whose timing relative to the src-setting
  // effect on a track change isn't guaranteed) — wraps setIsAudioPlaying
  // rather than AppLayout calling it directly. Doesn't clear playback
  // state — only an explicit close does — so a paused-and-abandoned tab
  // still resumes correctly elsewhere.
  const handlePause = useCallback(() => {
    setIsAudioPlaying(false);
    const cur = currentRef.current;
    if (cur) {
      playbackStateApi.save({
        playlistId: cur.playlistId, videoId: cur.video.id,
        positionSeconds: audioRef.current?.currentTime ?? 0,
        isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath: cur.originPath,
      }).catch(() => {});
    }
  }, []);

  // Best-effort save on tab close — sendBeacon fires reliably during
  // unload (unlike a normal fetch/axios call, which the browser can cancel
  // mid-flight) and rides the same-origin auth_token cookie automatically.
  useEffect(() => {
    const handlePageHide = () => {
      const cur = currentRef.current;
      if (!cur) return;
      const payload = {
        playlistId: cur.playlistId, videoId: cur.video.id,
        positionSeconds: audioRef.current?.currentTime ?? 0,
        isShuffle: isShuffleRef.current, isRepeat: isRepeatRef.current, originPath: cur.originPath,
      };
      navigator.sendBeacon('/api/playback-state', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

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
    setCurrent(prev => {
      if (prev?.playlistId !== playlistId) return prev;
      playbackStateApi.clear().catch(() => {});
      return null;
    });
  }, []);

  const handleClosePlayer = useCallback(() => {
    audioRef.current?.pause();
    setCurrent(null);
    playbackStateApi.clear().catch(() => {});
  }, []);

  // Patches the currently-playing track's own flag in place (rather than
  // relying on a later refetch) so the mini player's heart reflects the
  // toggle immediately, whether it was clicked there or on a track row
  // elsewhere that happens to be the same track.
  const toggleFavourite = useCallback(() => {
    const cur = currentRef.current;
    if (!cur) return;
    playlistsApi.toggleFavourite(cur.playlistId, cur.video.id)
      .then(({ isFavourite }) => {
        setCurrent(prev => (prev ? { ...prev, video: { ...prev.video, isFavourite } } : prev));
        showSuccess(t(isFavourite ? 'playlists.videoList.favouriteAdded' : 'playlists.videoList.favouriteRemoved', { title: cur.video.title }));
      })
      .catch(() => {});
  }, [t, showSuccess]);

  const value: PlayerContextType = {
    nowPlaying: current ? { playlistId: current.playlistId, videoId: current.video.id, originPath: current.originPath } : null,
    nowPlayingVideo: current?.video,
    skipSignal,
    isAudioPlaying, setIsAudioPlaying, handlePause, audioRef, analyserNode,
    hasNext, hasPrevious, isRepeat, isShuffle, toggleRepeat, toggleShuffle,
    handleTogglePlay, playNext, playPrevious, handleTrackEnded, stopIfPlaylist, handleClosePlayer, toggleFavourite,
    justPlayedBump,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextType {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
