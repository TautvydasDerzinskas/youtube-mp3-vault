import {
  Box, Typography, List, ListItemButton, ListItemAvatar, Avatar, ListItemText,
  CircularProgress, Alert,
} from '@mui/material';
import { MusicNote as MusicNoteIcon, YouTube as YouTubeIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { RemixResult } from '../../api/youtube';
import { formatDuration, youtubeWatchUrl } from '../PlaylistsPage/utils';

interface RemixLinksProps {
  state: RemixResult[] | 'loading' | 'error';
}

/** External YouTube links only — never downloaded. See searchRemixes on the backend for the dedup logic. */
export function RemixLinks({ state }: RemixLinksProps) {
  const { t } = useTranslation();

  return (
    <Box>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        {t('playlists.trackDetail.remixesTitle')}
      </Typography>

      {state === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      )}
      {state === 'error' && <Alert severity="error">{t('playlists.trackDetail.remixesFailed')}</Alert>}
      {Array.isArray(state) && state.length === 0 && (
        <Typography color="text.secondary">{t('playlists.trackDetail.remixesEmpty')}</Typography>
      )}
      {Array.isArray(state) && state.length > 0 && (
        <List dense disablePadding sx={{ border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px', overflow: 'hidden' }}>
          {state.map((remix) => (
            <ListItemButton key={remix.id} component="a" href={youtubeWatchUrl(remix.id)} target="_blank" rel="noopener noreferrer"
              sx={{ borderBottom: '1px solid #2a2a2a', '&:last-of-type': { borderBottom: 'none' } }}>
              <ListItemAvatar sx={{ minWidth: 52 }}>
                <Avatar src={remix.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 42, height: 30, borderRadius: 1 }}>
                  <MusicNoteIcon sx={{ fontSize: 16 }} />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={remix.title}
                secondary={remix.channelName ?? undefined}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
              />
              {remix.duration != null && (
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1, mr: 1 }}>
                  {formatDuration(remix.duration)}
                </Typography>
              )}
              <YouTubeIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  );
}
