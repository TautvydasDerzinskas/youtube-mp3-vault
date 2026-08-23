import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, ArrowBack as ArrowBackIcon, PlayArrow as PlayArrowIcon, Pause as PauseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Playlist } from '../../api/youtube';
import { displayName, formatBytes } from '../PlaylistsPage/utils';
import { GenreCount, SortOption } from './hooks/genreFilter';
import { TrackFilterBar } from './TrackFilterBar';

interface HeaderProps {
  playlist: Playlist;
  visibleCount: number;
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  hqOnly: boolean;
  onHqOnlyChange: (hqOnly: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onPlayFirst: () => void;
  canPlayFirst: boolean;
  isPlaying: boolean;
}

export function Header({
  playlist, visibleCount, genreCounts, selectedGenres, onToggleGenre, onClearGenres,
  sort, onSortChange, hqOnly, onHqOnlyChange, searchQuery, onSearchQueryChange,
  onPlayFirst, canPlayFirst, isPlaying,
}: HeaderProps) {
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
        <Tooltip title={isPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
          <span>
            <IconButton disabled={!canPlayFirst} onClick={onPlayFirst}
              sx={{ color: 'primary.main', flexShrink: 0 }}>
              {isPlaying ? <PauseIcon sx={{ fontSize: 32 }} /> : <PlayArrowIcon sx={{ fontSize: 32 }} />}
            </IconButton>
          </span>
        </Tooltip>

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
              label={visibleCount !== playlist.videoCount
                ? t('playlists.detail.trackCountFiltered', { visible: visibleCount, total: playlist.videoCount })
                : t('playlists.detail.trackCount', { count: playlist.videoCount })} />
            {playlist.totalSize > 0 && (
              <Chip size="small" variant="outlined" label={formatBytes(playlist.totalSize)} />
            )}
          </Stack>
        </Box>
      </Box>

      <TrackFilterBar
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
        sort={sort}
        onSortChange={onSortChange}
        hqOnly={hqOnly}
        onHqOnlyChange={onHqOnlyChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />
    </Box>
  );
}
