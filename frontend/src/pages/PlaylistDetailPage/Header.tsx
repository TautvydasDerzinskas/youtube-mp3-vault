import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist } from '../../api/youtube';
import { displayName, formatBytes } from '../PlaylistsPage/utils';
import { GenreCount } from './hooks/usePlaylistDetail';

interface HeaderProps {
  playlist: Playlist;
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
}

export function Header({ playlist, genreCounts, selectedGenres, onToggleGenre, onClearGenres }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box sx={{ mb: 3 }}>
      <Tooltip title={t('playlists.detail.back')}>
        <IconButton onClick={() => navigate('/playlists')} sx={{ mb: 1, ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Avatar src={playlist.thumbnailUrl ?? undefined} variant="rounded"
          sx={{ width: 96, height: 72, borderRadius: 2, flexShrink: 0 }}>
          <MusicNoteIcon sx={{ fontSize: 32 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
            {displayName(playlist)}
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip size="small" variant="outlined"
              label={t('playlists.detail.trackCount', { count: playlist.videoCount })} />
            <Chip size="small" variant="outlined" color={playlist.downloadedCount === playlist.videoCount ? 'success' : 'default'}
              label={t('playlists.detail.syncedCount', { count: playlist.downloadedCount })} />
            {playlist.totalSize > 0 && (
              <Chip size="small" variant="outlined" label={formatBytes(playlist.totalSize)} />
            )}
          </Stack>
        </Box>
      </Box>

      {genreCounts.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
              {t('playlists.detail.filterByGenre')}
            </Typography>
            {genreCounts.map(({ genre, count }) => {
              const selected = selectedGenres.has(genre);
              return (
                <Chip
                  key={genre}
                  label={`${genre} (${count})`}
                  size="small"
                  onClick={() => onToggleGenre(genre)}
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                />
              );
            })}
            {selectedGenres.size > 0 && (
              <Tooltip title={t('playlists.detail.clearGenreFilter')}>
                <IconButton size="small" onClick={onClearGenres}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
