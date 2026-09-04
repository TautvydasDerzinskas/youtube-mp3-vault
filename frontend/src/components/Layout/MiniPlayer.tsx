import { useEffect, useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Avatar, Slider, Popover } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Close as CloseIcon,
  SkipPrevious as SkipPreviousIcon, SkipNext as SkipNextIcon,
  Repeat as RepeatIcon, Shuffle as ShuffleIcon,
  Favorite as FavoriteIcon, FavoriteBorder as FavoriteBorderIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseIcon,
  VolumeUp as VolumeUpIcon, VolumeDown as VolumeDownIcon, VolumeOff as VolumeOffIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../hooks/useIsMobile';

interface MiniPlayerProps {
  title: string | undefined;
  artist: string | null | undefined;
  thumbnailUrl: string | null | undefined;
  isFavourite: boolean | undefined;
  onToggleFavourite: () => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  isAudioPlaying: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  isRepeat: boolean;
  isShuffle: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onClose: () => void;
  // Always defined whenever MiniPlayer itself is rendered — it's only ever
  // mounted (see AppLayout) once nowPlaying/nowPlayingVideo are set, and
  // those two always carry a playlistId together.
  onTitleClick: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function MiniPlayer({
  title, artist, thumbnailUrl, isFavourite, onToggleFavourite, audioRef, isAudioPlaying, hasNext, hasPrevious, isRepeat, isShuffle,
  onPlay, onPause, onEnded, onNext, onPrevious, onToggleRepeat, onToggleShuffle, onClose, onTitleClick,
}: MiniPlayerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Mirrors audioEl.volume — kept in sync below via the native
  // 'volumechange' event, so it stays correct whether it was changed here
  // (the popover slider) or elsewhere (e.g. PlayerContext's Cmd/Ctrl+Up/Down
  // shortcut, which sets audioEl.volume directly).
  const [volume, setVolume] = useState(1);
  const [volumeAnchorEl, setVolumeAnchorEl] = useState<HTMLElement | null>(null);

  // The <audio> element itself is native and unstyled (see the hidden
  // element rendered below) — this mirrors its currentTime/duration/volume
  // onto state so the custom scrubber/volume slider below can render them.
  // Re-binds whenever the mobile/desktop layout swap remounts the
  // underlying <audio> node (each layout renders its own, sharing the same
  // ref).
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const updateTime = () => setCurrentTime(audioEl.currentTime);
    const updateDuration = () => setDuration(audioEl.duration || 0);
    const updateVolume = () => setVolume(audioEl.muted ? 0 : audioEl.volume);
    updateTime();
    updateDuration();
    updateVolume();
    audioEl.addEventListener('timeupdate', updateTime);
    audioEl.addEventListener('durationchange', updateDuration);
    audioEl.addEventListener('loadedmetadata', updateDuration);
    audioEl.addEventListener('volumechange', updateVolume);
    return () => {
      audioEl.removeEventListener('timeupdate', updateTime);
      audioEl.removeEventListener('durationchange', updateDuration);
      audioEl.removeEventListener('loadedmetadata', updateDuration);
      audioEl.removeEventListener('volumechange', updateVolume);
    };
  }, [audioRef, isMobile]);

  const handlePlayPauseClick = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (audioEl.paused) audioEl.play().catch(() => {});
    else audioEl.pause();
  };

  const handleSeek = (_event: Event, value: number | number[]) => {
    const time = Array.isArray(value) ? value[0] : value;
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handleVolumeChange = (_event: Event, value: number | number[]) => {
    const v = (Array.isArray(value) ? value[0] : value) / 100;
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = false;
    }
  };

  const thumbnail = (
    <Avatar src={thumbnailUrl ?? undefined} variant="rounded"
      sx={{ width: isMobile ? 48 : 40, height: isMobile ? 48 : 40, borderRadius: 1, flexShrink: 0 }}>
      <MusicNoteIcon />
    </Avatar>
  );
  // Always rendered (not conditionally hidden) so the control cluster never
  // reflows as hasPrevious/hasNext change — just disabled, with the theme's
  // default reduced opacity for a disabled IconButton. Tooltip needs its
  // child wrapped in a <span> here: a disabled button fires no pointer
  // events of its own for Tooltip to hook into.
  const previousButton = (
    <Tooltip title={t('playlists.miniPlayer.previous')}>
      <span>
        <IconButton size="small" onClick={onPrevious} disabled={!hasPrevious} sx={{ flexShrink: 0 }}>
          <SkipPreviousIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
  const nextButton = (
    <Tooltip title={t('playlists.miniPlayer.next')}>
      <span>
        <IconButton size="small" onClick={onNext} disabled={!hasNext} sx={{ flexShrink: 0 }}>
          <SkipNextIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
  const playPauseButton = (
    <Tooltip title={t(isAudioPlaying ? 'playlists.miniPlayer.pause' : 'playlists.miniPlayer.play')}>
      <IconButton onClick={handlePlayPauseClick} sx={{
        flexShrink: 0, width: 44, height: 44, bgcolor: 'primary.main', color: 'primary.contrastText',
        '&:hover': { bgcolor: 'primary.dark' },
      }}>
        {isAudioPlaying ? <PauseIcon /> : <PlayArrowIcon sx={{ ml: '2px' }} />}
      </IconButton>
    </Tooltip>
  );
  const repeatButton = (
    <Tooltip title={t('playlists.miniPlayer.repeat')}>
      <IconButton size="small" onClick={onToggleRepeat} sx={{ flexShrink: 0, color: isRepeat ? 'primary.main' : undefined }}>
        <RepeatIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const shuffleButton = (
    <Tooltip title={t('playlists.miniPlayer.shuffle')}>
      <IconButton size="small" onClick={onToggleShuffle} sx={{ flexShrink: 0, color: isShuffle ? 'primary.main' : undefined }}>
        <ShuffleIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const favouriteButton = (
    <Tooltip title={t(isFavourite ? 'playlists.videoList.removeFavourite' : 'playlists.videoList.addFavourite')}>
      <IconButton size="small" onClick={onToggleFavourite} sx={{ flexShrink: 0 }}>
        {isFavourite
          ? <FavoriteIcon fontSize="small" sx={{ color: 'primary.main' }} />
          : <FavoriteBorderIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
  const closeButton = (
    <Tooltip title={t('playlists.miniPlayer.close')}>
      <IconButton size="small" onClick={onClose} sx={{ flexShrink: 0 }}>
        <CloseIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );

  const VolumeIcon = volume === 0 ? VolumeOffIcon : volume < 0.5 ? VolumeDownIcon : VolumeUpIcon;
  const volumeButton = (
    <>
      <Tooltip title={t('playlists.miniPlayer.volume')}>
        <IconButton size="small" onClick={(e) => setVolumeAnchorEl(e.currentTarget)} sx={{ flexShrink: 0 }}>
          <VolumeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(volumeAnchorEl)}
        anchorEl={volumeAnchorEl}
        onClose={() => setVolumeAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ height: 120, display: 'flex', alignItems: 'center', py: 2, px: 1.5 }}>
          <Slider
            orientation="vertical"
            size="small"
            value={volume * 100}
            onChange={handleVolumeChange}
            sx={{ color: 'primary.main' }}
          />
        </Box>
      </Popover>
    </>
  );

  const controlsRow = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
      {shuffleButton}
      {previousButton}
      {playPauseButton}
      {nextButton}
      {repeatButton}
    </Box>
  );

  const progressRow = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
        {formatTime(currentTime)}
      </Typography>
      <Slider
        size="small"
        value={Math.min(currentTime, duration || 0)}
        min={0}
        max={duration || 0}
        disabled={!duration}
        onChange={handleSeek}
        sx={{
          color: 'primary.main',
          py: 0.5,
          '& .MuiSlider-rail': { opacity: 1, bgcolor: 'divider' },
          '& .MuiSlider-thumb': {
            width: 12, height: 12,
            boxShadow: 'none',
            '&:hover, &.Mui-focusVisible': { boxShadow: (theme) => `0 0 0 8px ${theme.palette.primary.main}29` },
          },
        }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 32 }}>
        {formatTime(duration)}
      </Typography>
    </Box>
  );

  // Kept mounted (never `controls`) purely as the actual playback engine —
  // PlayerContext reads/drives it via audioRef, and the Web Audio graph for
  // visualization taps it too. All transport UI above is custom.
  const hiddenAudio = (
    <audio ref={audioRef} onPlay={onPlay} onPause={onPause} onEnded={onEnded} style={{ display: 'none' }} />
  );

  // Acts like "back to playlist" + auto-scroll to the playing track there —
  // see PlaylistDetailPage's scrollToNowPlaying handling.
  const titleBlock = (
    <Tooltip title={t('playlists.miniPlayer.backToPlaylist')}>
      <Box onClick={onTitleClick} sx={{ minWidth: 0, cursor: 'pointer' }}>
        <Typography variant="body2" noWrap>
          {title ?? t('common.loading')}
        </Typography>
        {artist && (
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {artist}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );

  if (isMobile) {
    return (
      <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'background.paper',
        borderTop: 1, borderColor: 'divider', px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, zIndex: 1200 }}>
        {thumbnail}
        <Box sx={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>{titleBlock}</Box>
            {favouriteButton}
            {volumeButton}
            {closeButton}
          </Box>
          {controlsRow}
          {progressRow}
        </Box>
        {hiddenAudio}
      </Box>
    );
  }

  return (
    // 3-column grid (not a plain flex row) so the center cluster
    // (controls + scrubber) sits at the bar's true horizontal center
    // regardless of how wide the left (thumbnail+title) or right (close
    // button) content actually is — the two 1fr columns always claim equal
    // space either side of the auto-sized center one, unlike a flex row
    // where the center's position would shift with its neighbors' sizes.
    <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'background.paper',
      borderTop: 1, borderColor: 'divider', px: 2, py: 1,
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 1.5, zIndex: 1200 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        {thumbnail}
        {/* A fixed width (not a min/max range) — the title/artist column
            must never resize with content length, or every button after it
            would shift left/right depending on how long the current track's
            name happens to be. noWrap on the Typography inside (see
            titleBlock above) ellipsizes whatever doesn't fit instead. */}
        <Box sx={{ width: 220, flexShrink: 0, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>{titleBlock}</Box>
          {favouriteButton}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: 'clamp(240px, 30vw, 500px)' }}>
        {controlsRow}
        {progressRow}
        {hiddenAudio}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        {volumeButton}
        {closeButton}
      </Box>
    </Box>
  );
}
