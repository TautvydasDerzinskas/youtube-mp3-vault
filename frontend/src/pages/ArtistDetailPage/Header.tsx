import { Box, Typography, Avatar, Chip, Stack } from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArtistDetail } from '../../api/artists';
import { allTracksGenreUrl } from '../PlaylistsPage/utils';
import { usePageBack, usePageTitle } from '../../contexts/PageBackContext';

interface HeaderProps {
  artist: ArtistDetail;
}

export function Header({ artist }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  usePageBack('/artists', t('common.backToArtists'));
  usePageTitle(t('artists.detail.pageTitle'));

  return (
    <Box sx={{ mb: 3, flexShrink: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Avatar src={artist.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 96, height: 96, borderRadius: 2, flexShrink: 0 }}>
          <MusicNoteIcon sx={{ fontSize: 32 }} />
        </Avatar>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>
            {artist.name}
          </Typography>

          <Stack direction="row" gap={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
            <Chip size="small" variant="outlined" label={t('artists.detail.songCount', { count: artist.songCount })} />
            <Chip size="small" variant="outlined" label={t('artists.detail.totalPlayCount', { count: artist.totalPlayCount })} />
          </Stack>

          {artist.bio && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 700 }}>
              {artist.bio}
            </Typography>
          )}

          {artist.genres.length > 0 && (
            <Stack direction="row" gap={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
              {artist.genres.map((g) => (
                <Chip
                  key={g.key}
                  size="small"
                  clickable
                  label={g.genre}
                  onClick={() => navigate(allTracksGenreUrl(g.key))}
                />
              ))}
            </Stack>
          )}

          {artist.playlists.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                {t('artists.detail.appearsIn')}
              </Typography>
              <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
                {artist.playlists.map((p) => (
                  <Chip
                    key={p.id}
                    size="small"
                    variant="outlined"
                    clickable
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
          )}
        </Box>
      </Box>
    </Box>
  );
}
