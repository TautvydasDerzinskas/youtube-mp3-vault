import {
  Box, Typography, List, ListItemButton, ListItemAvatar, Avatar, ListItemText,
  CircularProgress, Alert, IconButton, Tooltip,
} from '@mui/material';
import { MusicNote as MusicNoteIcon, YouTube as YouTubeIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { DiscoverResult } from '../../api/youtube';
import { formatDuration, youtubeWatchUrl } from '../PlaylistsPage/utils';

interface DiscoverTracksProps {
  state: DiscoverResult[] | 'loading' | 'error';
}

/**
 * External "you might also like" — Last.fm similar-track data (see
 * services/lastfm.ts), each resolved server-side to a best-guess playable
 * YouTube video where possible. Rows without a resolved match still show
 * (no YouTube icon, not clickable) since the Spotify search link — a plain
 * deep link, no API involved — always works regardless.
 */
export function DiscoverTracks({ state }: DiscoverTracksProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        {t('playlists.trackDetail.discoverTitle')}
      </Typography>

      {state === 'loading' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      )}
      {state === 'error' && <Alert severity="error">{t('playlists.trackDetail.discoverFailed')}</Alert>}
      {Array.isArray(state) && state.length === 0 && (
        <Typography color="text.secondary">{t('playlists.trackDetail.discoverEmpty')}</Typography>
      )}
      {Array.isArray(state) && state.length > 0 && (
        <List dense disablePadding sx={{ border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px', overflow: 'hidden' }}>
          {state.map((item, index) => {
            const rowSx = {
              display: 'flex', alignItems: 'center', px: 2, py: 1,
              borderBottom: '1px solid #2a2a2a', '&:last-of-type': { borderBottom: 'none' },
            };
            const inner = (
              <>
                <ListItemAvatar sx={{ minWidth: 52 }}>
                  <Avatar src={item.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 42, height: 30, borderRadius: 1 }}>
                    <MusicNoteIcon sx={{ fontSize: 16 }} />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={item.title}
                  secondary={item.artist}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                />
                {item.duration != null && (
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1, mr: 1 }}>
                    {formatDuration(item.duration)}
                  </Typography>
                )}
                <Tooltip title={t('playlists.trackDetail.openInSpotify')}>
                  <IconButton
                    size="small"
                    component="a"
                    href={item.spotifySearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    sx={{ color: 'text.secondary', flexShrink: 0 }}
                  >
                    <OpenInNewIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                {item.youtubeId && (
                  <YouTubeIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0, ml: 0.5 }} />
                )}
              </>
            );

            return item.youtubeId ? (
              <ListItemButton
                key={`${item.artist}-${item.title}-${index}`}
                component="a"
                href={youtubeWatchUrl(item.youtubeId)}
                target="_blank"
                rel="noopener noreferrer"
                sx={rowSx}
              >
                {inner}
              </ListItemButton>
            ) : (
              <Box key={`${item.artist}-${item.title}-${index}`} sx={rowSx}>
                {inner}
              </Box>
            );
          })}
        </List>
      )}
    </Box>
  );
}
