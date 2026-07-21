import { Paper, Typography, Box, List, ListItemButton, ListItemAvatar, Avatar, ListItemText, Button } from '@mui/material';
import { Repeat as RepeatIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardSong } from '../../api/dashboard';

interface Props {
  songs: DashboardSong[];
  onSeeMore: () => void;
}

export function SongsOnRepeatCard({ songs, onSeeMore }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Paper elevation={0} sx={{
      gridArea: 'songs', p: 2.5, border: '1px solid', borderColor: '#2a2a2a', borderRadius: '8px',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <RepeatIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>{t('dashboard.songsOnRepeat.title')}</Typography>
      </Box>

      {songs.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2 }}>{t('dashboard.songsOnRepeat.empty')}</Typography>
      ) : (
        <List dense disablePadding>
          {songs.map((song, idx) => (
            <ListItemButton
              key={song.id}
              onClick={() => navigate(`/playlists/${song.playlistId}/${song.id}`)}
              sx={{ borderRadius: 1, px: 1 }}
            >
              <Typography sx={{ width: 24, flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>{idx + 1}</Typography>
              <ListItemAvatar sx={{ minWidth: 48 }}>
                <Avatar src={song.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 40, height: 40 }}>
                  <MusicNoteIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={song.title}
                secondary={song.artist ?? undefined}
                primaryTypographyProps={{ noWrap: true }}
                secondaryTypographyProps={{ noWrap: true }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pl: 1 }}>
                {t('dashboard.playCount', { count: song.playCount })}
              </Typography>
            </ListItemButton>
          ))}
        </List>
      )}

      <Button onClick={onSeeMore} sx={{ alignSelf: 'flex-start', mt: 1 }}>{t('dashboard.seeMore')}</Button>
    </Paper>
  );
}
