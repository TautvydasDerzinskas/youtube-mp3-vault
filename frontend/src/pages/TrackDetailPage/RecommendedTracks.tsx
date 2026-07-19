import {
  Box, Typography, List, ListItemButton, ListItemAvatar, Avatar, ListItemText,
  CircularProgress, Alert,
} from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RecommendedTrack } from '../../api/youtube';
import { formatDuration, formatGenre } from '../PlaylistsPage/utils';

interface RecommendedTracksProps {
  state: RecommendedTrack[] | 'loading' | 'error';
}

/** In-library "sounds like this" — see the /recommendations endpoint (audio-embedding cosine similarity, not genre). */
export function RecommendedTracks({ state }: RecommendedTracksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
          {state.map((rec) => (
            <ListItemButton key={rec.id} onClick={() => navigate(`/playlists/${rec.playlistId}/${rec.id}`)}
              sx={{ borderBottom: '1px solid #2a2a2a', '&:last-of-type': { borderBottom: 'none' } }}>
              <ListItemAvatar sx={{ minWidth: 52 }}>
                <Avatar src={rec.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 42, height: 30, borderRadius: 1 }}>
                  <MusicNoteIcon sx={{ fontSize: 16 }} />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={rec.title}
                secondary={[rec.artist, rec.genres.length > 0 ? rec.genres.map(formatGenre).join(', ') : null].filter(Boolean).join(' · ') || undefined}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
              />
              {rec.duration != null && (
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1 }}>
                  {formatDuration(rec.duration)}
                </Typography>
              )}
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
