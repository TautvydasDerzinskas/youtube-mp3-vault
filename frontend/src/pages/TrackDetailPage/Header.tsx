import { useState } from 'react';
import { Box, Typography, Avatar, Chip, Stack, IconButton, Tooltip, CircularProgress, LinearProgress } from '@mui/material';
import {
  MusicNote as MusicNoteIcon,
  PlayArrow as PlayArrowIcon, Pause as PauseIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlaylistVideo, UsedInPlaylist } from '../../api/youtube';
import { formatDuration, formatGenre, normalizeGenreKey, allTracksGenreUrl, artistUrl, STATUS_ICON } from '../PlaylistsPage/utils';
import { usePageBack } from '../../contexts/PageBackContext';
import { useTrackActions } from '../../hooks/useTrackActions';
import { TrackContextMenu } from '../../components/TrackContextMenu';
import { CloseHqCandidatesDialog } from '../../components/CloseHqCandidatesDialog';

interface HeaderProps {
  playlistId: string;
  video: PlaylistVideo;
  isCurrentTrack: boolean;
  isAudioPlaying: boolean;
  onTogglePlay: () => void;
  usedIn: UsedInPlaylist[] | 'loading' | 'error';
  onDeleted: (videoId: string) => void;
  onUpdated: (video: PlaylistVideo) => void;
}

export function Header({ playlistId, video, isCurrentTrack, isAudioPlaying, onTogglePlay, usedIn, onDeleted, onUpdated }: HeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isPlayable = video.downloadStatus === 'done';
  const isPlayingThis = isCurrentTrack && isAudioPlaying;
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const {
    searching, closeCandidates, handleSearchHq, handleRename, handleDismissCloseCandidates, handleSelectCloseCandidate,
  } = useTrackActions({ video, playlistId, isCurrentTrack, isAudioPlaying, onTogglePlay, onUpdated });
  usePageBack(`/playlists/${playlistId}`, t('common.backToPlaylist'));

  return (
    <Box sx={{ mb: 4 }}>
      {/* Thumbnail (with its own always-visible play/pause overlay), title/
          artist and the "..." actions menu all stay on one line — long text
          ellipsizes (noWrap) instead of wrapping and pushing this row onto
          two lines. Everything else (chips/appears-in) always renders in its
          own full-width block below, never squeezed into the narrower
          column beside the thumbnail. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Avatar src={video.thumbnailUrl ?? undefined} variant="rounded" sx={{ width: 160, height: 120, borderRadius: 2 }}>
            <MusicNoteIcon sx={{ fontSize: 48 }} />
          </Avatar>
          {isPlayable ? (
            <Tooltip title={isPlayingThis ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
              <span>
                <IconButton
                  disabled={searching}
                  onClick={onTogglePlay}
                  sx={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                  }}
                >
                  {isPlayingThis ? <PauseIcon sx={{ fontSize: 36 }} /> : <PlayArrowIcon sx={{ fontSize: 36 }} />}
                </IconButton>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={video.downloadStatus === 'failed' && video.downloadError ? video.downloadError : t(`playlists.status.${video.downloadStatus}`)}>
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {STATUS_ICON[video.downloadStatus] ?? null}
              </Box>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="h4" fontWeight={700} noWrap>{video.title}</Typography>
          {video.artist && (
            <Typography
              variant="h6"
              color="text.secondary"
              noWrap
              onClick={() => navigate(artistUrl(video.artist!))}
              sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
              {video.artist}
            </Typography>
          )}
        </Box>

        <Tooltip title={t('playlists.videoList.moreActions')}>
          <IconButton onClick={(e) => setMenuPos({ top: e.clientY, left: e.clientX })} sx={{ flexShrink: 0 }}>
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {searching && <LinearProgress sx={{ mt: 2 }} />}

      <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {video.duration && <Chip size="small" variant="outlined" label={formatDuration(video.duration)} />}
            {video.hqFileDownloaded && (
              <Tooltip title={t('playlists.videoList.hqDownloaded')}>
                <Chip size="small" variant="outlined" label={t('playlists.trackDetail.hqLabel')} />
              </Tooltip>
            )}
            <Chip size="small" variant="outlined" label={t('artists.detail.totalPlayCount', { count: video.playCount })} />
          </Stack>

          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
            {video.genres.map((g) => (
              <Chip key={g} size="small" clickable label={formatGenre(g)} onClick={() => navigate(allTracksGenreUrl(normalizeGenreKey(g)))} />
            ))}
            {video.releaseYear && <Chip size="small" variant="outlined" label={video.releaseYear} />}
          </Stack>
        </Box>

        {usedIn === 'loading' ? (
          <Box sx={{ display: 'flex' }}><CircularProgress size={16} /></Box>
        ) : usedIn !== 'error' && usedIn.length > 0 && (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              {t('artists.detail.appearsIn')}
            </Typography>
            <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
              {usedIn.map((p) => (
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

      <TrackContextMenu
        playlistId={playlistId}
        video={video}
        position={menuPos}
        onClose={() => setMenuPos(null)}
        onDeleted={onDeleted}
        searching={searching}
        onSearchHq={handleSearchHq}
        onRename={handleRename}
      />
      {closeCandidates.length > 0 && (
        <CloseHqCandidatesDialog
          video={video}
          candidates={closeCandidates}
          onDismiss={handleDismissCloseCandidates}
          onSelect={handleSelectCloseCandidate}
        />
      )}
    </Box>
  );
}
