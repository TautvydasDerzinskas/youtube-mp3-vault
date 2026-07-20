import {
  Box, Typography, List, ListItemButton, ListItemAvatar, Avatar, ListItemText,
  CircularProgress, Alert, IconButton, Tooltip,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon, PlayArrow as PlayArrowIcon, Pause as PauseTrackIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RecommendedTrack } from '../../api/youtube';
import { formatDuration, formatGenre } from '../PlaylistsPage/utils';
import { NowPlaying } from '../PlaylistsPage/types';
import { QueueTrack } from '../../contexts/PlayerContext';

// Recommendations don't carry the full PlaylistVideo shape (no downloadStatus,
// position, etc.) since the endpoint already filters to downloaded, analyzed
// tracks — this fills in the rest with values the player never actually reads
// for a queue track, so the list can double as a playable queue.
function toQueueTrack(rec: RecommendedTrack): QueueTrack {
  return {
    id: rec.id,
    playlistId: rec.playlistId,
    youtubeId: rec.youtubeId,
    title: rec.title,
    duration: rec.duration,
    thumbnailUrl: rec.thumbnailUrl,
    position: 0,
    isAvailable: true,
    downloadStatus: 'done',
    downloadError: null,
    fileSize: null,
    bitrate: null,
    addedAt: '',
    artist: rec.artist,
    album: null,
    trackNumber: null,
    genres: rec.genres,
    releaseYear: null,
    metadataStatus: 'pending',
    playCount: 0,
    lastPlayedAt: null,
  };
}

interface RecommendedTracksProps {
  state: RecommendedTrack[] | 'loading' | 'error';
  nowPlaying: NowPlaying | null;
  isAudioPlaying: boolean;
  onTogglePlay: (playlistId: string, video: QueueTrack, queue?: QueueTrack[]) => void;
}

/** In-library "sounds like this" — see the /recommendations endpoint (audio-embedding cosine similarity, boosted by same-artist/same-genre). */
export function RecommendedTracks({ state, nowPlaying, isAudioPlaying, onTogglePlay }: RecommendedTracksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const queue = Array.isArray(state) ? state.map(toQueueTrack) : [];

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        {t('playlists.trackDetail.recommendedTitle')}
      </Typography>

      {state === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      )}
      {state === 'error' && <Alert severity="error">{t('playlists.trackDetail.recommendedFailed')}</Alert>}
      {Array.isArray(state) && state.length === 0 && (
        <Typography color="text.secondary">{t('playlists.trackDetail.recommendedEmpty')}</Typography>
      )}
      {Array.isArray(state) && state.length > 0 && (
        <List dense disablePadding sx={{ border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px', overflow: 'hidden' }}>
          {state.map((rec, index) => {
            const isCurrentTrack = nowPlaying?.playlistId === rec.playlistId && nowPlaying?.videoId === rec.id;
            return (
              <ListItemButton key={rec.id} onClick={() => navigate(`/playlists/${rec.playlistId}/${rec.id}`)}
                selected={isCurrentTrack}
                sx={{ borderBottom: '1px solid #2a2a2a', '&:last-of-type': { borderBottom: 'none' } }}>
                <ListItemAvatar sx={{ minWidth: 52 }}>
                  <Avatar src={rec.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 42, height: 30, borderRadius: 1 }}>
                    <MusicNoteIcon sx={{ fontSize: 16 }} />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={rec.title}
                  secondary={[rec.artist, rec.genres.length > 0 ? rec.genres.map(formatGenre).join(', ') : null].filter(Boolean).join(' · ') || undefined}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true, fontWeight: isCurrentTrack ? 700 : 400, color: isCurrentTrack ? 'primary.main' : 'inherit' }}
                  secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                />
                {rec.duration != null && (
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1, mr: 1 }}>
                    {formatDuration(rec.duration)}
                  </Typography>
                )}
                <Tooltip title={isCurrentTrack && isAudioPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onTogglePlay(rec.playlistId, queue[index], queue); }} sx={{ color: 'primary.main', flexShrink: 0 }}>
                    {isCurrentTrack && isAudioPlaying
                      ? <PauseTrackIcon sx={{ fontSize: 18 }} />
                      : <PlayArrowIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Box>
  );
}
