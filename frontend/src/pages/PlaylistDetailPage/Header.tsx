import { useState } from 'react';
import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist } from '../../api/youtube';
import { displayName, formatBytes } from '../PlaylistsPage/utils';
import { GenreCount, NO_GENRE_KEY } from './hooks/usePlaylistDetail';

// Most libraries have a handful of genres with real weight and a long tail of
// one/two-track genres from misc tagging — showing all of them by default
// buries the useful filters. Collapsed to this many, with a link to reveal
// the rest, since the list is already sorted by count.
const VISIBLE_GENRES_LIMIT = 20;

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
  const [showAllGenres, setShowAllGenres] = useState(false);

  const hasMoreGenres = genreCounts.length > VISIBLE_GENRES_LIMIT;
  // A genre selected via URL (e.g. a shared link) must stay visible even if
  // it falls outside the collapsed top N, or its active chip — and the only
  // way to clear it — would silently disappear.
  const visibleGenres = showAllGenres
    ? genreCounts
    : genreCounts.filter((g, i) => i < VISIBLE_GENRES_LIMIT || selectedGenres.has(g.key));

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
            {visibleGenres.map(({ key, label, count }) => {
              const selected = selectedGenres.has(key);
              const isNoGenre = key === NO_GENRE_KEY;
              const chipLabel = isNoGenre ? t('playlists.detail.noGenre', { count }) : `${label} (${count})`;
              return (
                <Chip
                  key={key}
                  label={chipLabel}
                  size="small"
                  onClick={() => onToggleGenre(key)}
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  sx={isNoGenre ? { fontStyle: 'italic' } : undefined}
                />
              );
            })}
            {hasMoreGenres && (
              <Chip
                size="small"
                variant="outlined"
                label={showAllGenres ? t('playlists.detail.showFewerGenres') : t('playlists.detail.showMoreGenres', { count: genreCounts.length - VISIBLE_GENRES_LIMIT })}
                onClick={() => setShowAllGenres(v => !v)}
                sx={{ borderStyle: 'dashed' }}
              />
            )}
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
