import { Box, Typography, IconButton, Tooltip, Avatar } from '@mui/material';
import {
  MusicNote as MusicNoteIcon, Close as CloseIcon,
  SkipPrevious as SkipPreviousIcon, SkipNext as SkipNextIcon,
  Repeat as RepeatIcon, Shuffle as ShuffleIcon,
  Favorite as FavoriteIcon, FavoriteBorder as FavoriteBorderIcon,
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

export function MiniPlayer({
  title, artist, thumbnailUrl, isFavourite, onToggleFavourite, audioRef, hasNext, hasPrevious, isRepeat, isShuffle,
  onPlay, onPause, onEnded, onNext, onPrevious, onToggleRepeat, onToggleShuffle, onClose, onTitleClick,
}: MiniPlayerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const thumbnail = (
    <Avatar src={thumbnailUrl ?? undefined} variant="rounded"
      sx={{ width: isMobile ? 48 : 40, height: isMobile ? 48 : 40, borderRadius: 1, flexShrink: 0 }}>
      <MusicNoteIcon />
    </Avatar>
  );
  const previousButton = hasPrevious && (
    <Tooltip title={t('playlists.miniPlayer.previous')}>
      <IconButton size="small" onClick={onPrevious} sx={{ flexShrink: 0 }}>
        <SkipPreviousIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  const nextButton = hasNext && (
    <Tooltip title={t('playlists.miniPlayer.next')}>
      <IconButton size="small" onClick={onNext} sx={{ flexShrink: 0 }}>
        <SkipNextIcon fontSize="small" />
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
        {previousButton}
        <Box sx={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>{titleBlock}</Box>
            {favouriteButton}
          </Box>
          <audio
            ref={audioRef}
            controls
            style={{ width: '100%', height: 28 }}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
          />
        </Box>
        {nextButton}
        {repeatButton}
        {shuffleButton}
        {closeButton}
      </Box>
    );
  }

  return (
    // 3-column grid (not a plain flex row) so the center cluster
    // (prev/audio/next/repeat/shuffle) sits at the bar's true horizontal
    // center regardless of how wide the left (thumbnail+title) or right
    // (close button) content actually is — the two 1fr columns always claim
    // equal space either side of the auto-sized center one, unlike a flex
    // row where the center's position would shift with its neighbors' sizes.
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

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {previousButton}
        <audio
          ref={audioRef}
          controls
          style={{ height: 32, width: 'clamp(240px, 30vw, 500px)' }}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
        />
        {nextButton}
        {repeatButton}
        {shuffleButton}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {closeButton}
      </Box>
    </Box>
  );
}
