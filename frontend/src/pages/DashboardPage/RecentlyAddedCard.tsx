import { Paper, Typography, Box, List, ListItemButton, ListItemAvatar, Avatar, ListItemText } from '@mui/material';
import { NewReleases as NewReleasesIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardRecentTrack } from '../../api/dashboard';
import { timeAgo } from '../PlaylistsPage/utils';

interface Props {
  tracks: DashboardRecentTrack[];
}

export function RecentlyAddedCard({ tracks }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper elevation={0} sx={{
      p: 2.5, border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
      display: 'flex', flexDirection: 'column',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <NewReleasesIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>{t('dashboard.recentlyAdded.title')}</Typography>
      </Box>

      {tracks.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t('dashboard.recentlyAdded.empty')}</Typography>
      ) : (
        <List dense disablePadding>
          {tracks.map((track) => (
            <ListItemButton
              key={track.id}
              onClick={() => navigate(`/playlists/${track.playlistId}/${track.id}`)}
              sx={{ borderRadius: 1, px: 1 }}
            >
              <ListItemAvatar sx={{ minWidth: 48 }}>
                <Avatar src={track.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 40, height: 40 }}>
                  <MusicNoteIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={track.title}
                secondary={[track.artist, track.playlistName].filter(Boolean).join(' · ')}
                primaryTypographyProps={{ noWrap: true }}
                secondaryTypographyProps={{ noWrap: true }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                {timeAgo(track.addedAt, t)}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}
    </Paper>
  );
}
