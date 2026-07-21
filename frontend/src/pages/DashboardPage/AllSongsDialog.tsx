import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, CircularProgress, Alert,
  List, ListItemButton, ListItemAvatar, Avatar, ListItemText,
} from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dashboardApi, DashboardSong } from '../../api/dashboard';

export function AllSongsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [songs, setSongs] = useState<DashboardSong[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    dashboardApi.getAllSongs().then(setSongs).catch(() => setSongs('error'));
  }, []);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('dashboard.songsOnRepeat.title')}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: 480 }}>
        {songs === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {songs === 'error' && <Alert severity="error">{t('dashboard.loadError')}</Alert>}
        {Array.isArray(songs) && songs.length === 0 && (
          <Typography color="text.secondary">{t('dashboard.songsOnRepeat.empty')}</Typography>
        )}
        {Array.isArray(songs) && songs.length > 0 && (
          <List dense disablePadding>
            {songs.map((song, idx) => (
              <ListItemButton
                key={song.id}
                onClick={() => { onClose(); navigate(`/playlists/${song.playlistId}/${song.id}`); }}
                sx={{ borderRadius: 1, px: 1 }}
              >
                <Typography sx={{ width: 28, flexShrink: 0, color: 'text.secondary', fontWeight: 600 }}>{idx + 1}</Typography>
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
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
