import { useState } from 'react';
import { Box, Typography, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GenreCount, NO_GENRE_KEY } from './hooks/genreFilter';
import { useIsMobile } from '../../hooks/useIsMobile';

const VISIBLE_GENRES_LIMIT_DESKTOP = 20;
const VISIBLE_GENRES_LIMIT_MOBILE = 5;

interface GenreFilterBarProps {
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
}

// Shared by PlaylistDetailPage and AllTracksPage — both filter a track list
// by genre the same way, just sourced from a different set of tracks.
export function GenreFilterBar({ genreCounts, selectedGenres, onToggleGenre, onClearGenres }: GenreFilterBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [showAllGenres, setShowAllGenres] = useState(false);

  if (genreCounts.length === 0) return null;

  const visibleGenresLimit = isMobile ? VISIBLE_GENRES_LIMIT_MOBILE : VISIBLE_GENRES_LIMIT_DESKTOP;
  const hasMoreGenres = genreCounts.length > visibleGenresLimit;
  const visibleGenres = showAllGenres
    ? genreCounts
    : genreCounts.filter((g, i) => i < visibleGenresLimit || selectedGenres.has(g.key));

  return (
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
            label={showAllGenres ? t('playlists.detail.showFewerGenres') : t('playlists.detail.showMoreGenres', { count: genreCounts.length - visibleGenresLimit })}
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
  );
}
