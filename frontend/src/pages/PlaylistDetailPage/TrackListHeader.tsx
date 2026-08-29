import { Box, Typography, Tooltip } from '@mui/material';
import { AccessTime as DurationIcon, MoreVert as MoreVertIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { TRACK_ROW_LAYOUT } from '../../components/TrackRow';

// Column labels for TrackList's rows below — widths mirror
// TRACK_ROW_LAYOUT exactly (same constants TrackRow.tsx itself uses) so
// this stays pixel-aligned with the columns it's labeling as either one
// changes. The release-year column between "Plays" and "Genre" has no
// label of its own (a small secondary detail, not one of the named
// columns), so it's just a same-width blank spacer here.
export function TrackListHeader() {
  const { t } = useTranslation();

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: TRACK_ROW_LAYOUT.gap, px: 1.5, py: 0.75,
      borderBottom: 1, borderColor: 'divider',
    }}>
      <Box sx={{ width: TRACK_ROW_LAYOUT.thumbnailWidth, flexShrink: 0 }} />

      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ minWidth: 0, flexGrow: 1 }}>
        {t('playlists.videoList.columnTrack')}
      </Typography>

      <Typography variant="caption" color="text.secondary" fontWeight={600}
        sx={{ width: TRACK_ROW_LAYOUT.playsWidth, flexShrink: 0, textAlign: 'left', display: { xs: 'none', sm: 'block' } }}>
        {t('playlists.videoList.columnPlays')}
      </Typography>

      <Box sx={{ width: TRACK_ROW_LAYOUT.yearWidth, flexShrink: 0, display: { xs: 'none', sm: 'block' } }} />

      <Typography variant="caption" color="text.secondary" fontWeight={600}
        sx={{ width: TRACK_ROW_LAYOUT.genreWidth, flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
        {t('playlists.videoList.columnGenre')}
      </Typography>

      <Tooltip title={t('playlists.videoList.columnDuration')}>
        <Box sx={{ width: TRACK_ROW_LAYOUT.durationWidth, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <DurationIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        </Box>
      </Tooltip>

      <Box sx={{ width: TRACK_ROW_LAYOUT.utilityClusterWidth, flexShrink: 0 }} />

      <Tooltip title={t('playlists.videoList.moreActions')}>
        <Box sx={{ width: TRACK_ROW_LAYOUT.actionsWidth, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          <MoreVertIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        </Box>
      </Tooltip>
    </Box>
  );
}
