import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { MusicNote as MusicNoteIcon, PlayArrow as PlayArrowIcon, Pause as PauseIcon, MoreVert as MoreVertIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../api/youtube';
import { displayName, formatBytes } from '../PlaylistsPage/utils';
import { GenreCount, SortOption, HqFilterOption, FavouriteFilterOption } from './hooks/genreFilter';
import { TrackFilterBar } from './TrackFilterBar';
import { PlaylistActionsMenu } from '../PlaylistsPage/PlaylistRow/PlaylistActionsMenu';
import { usePageBack, usePageTitle } from '../../contexts/PageBackContext';

interface HeaderProps {
  playlist: Playlist;
  visibleCount: number;
  genreCounts: GenreCount[];
  selectedGenres: Set<string>;
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  hqFilter: HqFilterOption;
  onHqFilterChange: (hqFilter: HqFilterOption) => void;
  favouriteFilter: FavouriteFilterOption;
  onFavouriteFilterChange: (favouriteFilter: FavouriteFilterOption) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onPlayFirst: () => void;
  canPlayFirst: boolean;
  isPlaying: boolean;
  // "..." actions menu — same shared PlaylistActionsMenu the playlist list
  // row uses (minus "Open", which doesn't apply from the page it opens to).
  isBusy: boolean;
  isPausing: boolean;
  isRetrying: boolean;
  online: boolean;
  menuPos: { top: number; left: number } | null;
  onMenuPosChange: (pos: { top: number; left: number } | null) => void;
  onRename: (playlist: Playlist) => void;
  onSync: (e: React.MouseEvent, id: string) => void;
  onRetryFailed: (e: React.MouseEvent, id: string) => void;
  onScanHq: (e: React.MouseEvent, playlist: Playlist) => void;
  onTogglePause: (e: React.MouseEvent, playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
}

export function Header({
  playlist, visibleCount, genreCounts, selectedGenres, onToggleGenre, onClearGenres,
  sort, onSortChange, hqFilter, onHqFilterChange,
  favouriteFilter, onFavouriteFilterChange, searchQuery, onSearchQueryChange,
  onPlayFirst, canPlayFirst, isPlaying,
  isBusy, isPausing, isRetrying, online, menuPos, onMenuPosChange,
  onRename, onSync, onRetryFailed, onScanHq, onTogglePause, onDelete,
}: HeaderProps) {
  const { t } = useTranslation();
  usePageBack('/playlists', t('common.backToPlaylists'));
  usePageTitle(t('playlists.detail.pageTitle'));

  return (
    <Box sx={{ mb: 3, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* First column — stretches to fill the row: thumbnail (with its own
            always-visible centered play/pause, matching the track detail
            page's header) plus title/chips. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ position: 'relative', flexShrink: 0 }}>
            <Avatar src={playlist.thumbnailUrl ?? undefined} variant="rounded"
              sx={{ width: 96, height: 72, borderRadius: 2 }}>
              <MusicNoteIcon sx={{ fontSize: 32 }} />
            </Avatar>
            <Tooltip title={isPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
              <span>
                <IconButton disabled={!canPlayFirst} onClick={onPlayFirst}
                  sx={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                  }}>
                  {isPlaying ? <PauseIcon sx={{ fontSize: 28 }} /> : <PlayArrowIcon sx={{ fontSize: 28 }} />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

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

        {/* Second column — fixed-width, centered "..." actions trigger. */}
        <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Tooltip title={t('playlists.moreActions')}>
            <IconButton onClick={(e) => onMenuPosChange({ top: e.clientY, left: e.clientX })}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <TrackFilterBar
        genreCounts={genreCounts}
        selectedGenres={selectedGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
        sort={sort}
        onSortChange={onSortChange}
        hqFilter={hqFilter}
        onHqFilterChange={onHqFilterChange}
        favouriteFilter={favouriteFilter}
        onFavouriteFilterChange={onFavouriteFilterChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      <PlaylistActionsMenu
        playlist={playlist}
        isBusy={isBusy}
        isPausing={isPausing}
        isRetrying={isRetrying}
        online={online}
        // The detail page has no concept of "locked by an actively-generating
        // derivative" the way the list page does (that's derived by scanning
        // every OTHER playlist for one sourced from this id) — rename/delete
        // are only truly unsafe during that narrow window, so this page
        // simply doesn't protect against it rather than fetching the whole
        // playlist list just to check.
        isLockedBySource={false}
        menuPos={menuPos}
        onMenuPosChange={onMenuPosChange}
        isPlaying={isPlaying}
        canPlayFirst={canPlayFirst}
        onPlayFirst={onPlayFirst}
        onRename={onRename}
        onSync={onSync}
        onRetryFailed={onRetryFailed}
        onScanHq={onScanHq}
        onTogglePause={onTogglePause}
        onDelete={onDelete}
      />
    </Box>
  );
}
