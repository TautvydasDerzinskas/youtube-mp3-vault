import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist } from '../../api/youtube';
import { displayName, formatBytes } from '../PlaylistsPage/utils';
import { GenreCount } from './hooks/genreFilter';
import { GenreFilterBar } from './GenreFilterBar';

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
    <Box sx={{ mb: 3, flexShrink: 0 }}>
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
          {playlist.sourcePlaylistName && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {t('playlists.generatedFrom', { name: playlist.sourcePlaylistName })}
            </Typography>
          )}
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

      <GenreFilterBar
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
      />
    </Box>
  );
}
