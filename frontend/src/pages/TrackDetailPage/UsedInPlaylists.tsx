import { Box, Typography, Chip, Stack, Avatar, CircularProgress } from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UsedInPlaylist } from '../../api/youtube';

interface UsedInPlaylistsProps {
  state: UsedInPlaylist[] | 'loading' | 'error';
}

/**
 * Other playlists (this user's own) containing this same YouTube video —
 * e.g. a generated playlist and the source it came from. Same loading/empty
 * contract as RecommendedTracks/DiscoverTracks/RemixLinks — bare spinner
 * while loading, nothing at all once resolved if there's nothing to show.
 */
export function UsedInPlaylists({ state }: UsedInPlaylistsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (state === 'loading') {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>;
  }
  if (state === 'error' || state.length === 0) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        {t('playlists.trackDetail.usedInTitle')}
      </Typography>

      <Stack direction="row" gap={1} flexWrap="wrap">
        {state.map((p) => (
          <Chip
            key={p.id}
            clickable
            variant="outlined"
            label={p.title}
            onClick={() => navigate(`/playlists/${p.id}`)}
            avatar={
              <Avatar src={p.thumbnailUrl ?? undefined}>
                <MusicNoteIcon sx={{ fontSize: 14 }} />
              </Avatar>
            }
          />
        ))}
      </Stack>
    </Box>
  );
}
