import { useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItemButton, ListItemText, Chip,
  Box, Typography, IconButton, Tooltip, Alert,
} from '@mui/material';
import { YouTube as YouTubeIcon, PlayArrow as PlayArrowIcon, Stop as StopIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { CloseHqCandidate, PlaylistVideo } from '../api/youtube';
import { youtubeWatchUrl, formatDuration } from '../pages/PlaylistsPage/utils';
import { ConfirmDialog } from './ConfirmDialog';

// Brand names — deliberately not run through i18n, same as the admin HQ
// settings page's own provider labels (see i18n/locales/*.json's
// admin.hq.provider.*, identical across every locale). "Soulseek" (not
// "slskd", the daemon's own name) since that's the network name a user
// would actually recognize. No JioSaavn entry — see CloseHqCandidate's own
// doc comment on the backend for why it's excluded from this list.
const PROVIDER_LABEL: Record<CloseHqCandidate['provider'], string> = {
  slskd: 'Soulseek',
  deezer: 'Deezer',
  qobuz: 'Qobuz',
  tidal: 'Tidal',
};

interface CloseHqCandidatesDialogProps {
  // Only the original-title/current-track/YouTube-link/duration comparison
  // rows need this — see RenameTrackDialog's identical original-title row,
  // which this one is deliberately styled to match. `artist` is needed
  // alongside `title` to build the "current track" comparison line below.
  video: Pick<PlaylistVideo, 'youtubeId' | 'originalTitle' | 'title' | 'artist' | 'duration'>;
  candidates: CloseHqCandidate[];
  onDismiss: () => void;
  // Renames the track to the picked candidate's artist/title (reusing the
  // row's own rename lifecycle — see TrackRow's handleRename) — the backend
  // then re-attempts the HQ search under the corrected name, same as any
  // other rename.
  onSelect: (artist: string, title: string) => void;
}

/**
 * Shown after a manual "Search for HQ" comes up with no downloadable match,
 * but one of the providers it searches (Soulseek or a connected Deezer/
 * Qobuz/Tidal account) turned up real search results that just didn't clear
 * the match-confidence bar (see CloseHqCandidate's own doc comment on the
 * backend, including why the list is capped at 5) — usually because the
 * video's own stored name differs slightly (a remix tag, a diacritic, a
 * feat. credit) from the provider's canonical one. Each candidate's own
 * reported duration is shown alongside our video's, right next to the
 * original title, so a duration mismatch (the most common reason a
 * same-titled candidate isn't actually the same recording) is visible at a
 * glance rather than something the user has to go verify. Picking one asks
 * for confirmation, then renames the track to match it.
 */
export function CloseHqCandidatesDialog({ video, candidates, onDismiss, onSelect }: CloseHqCandidatesDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CloseHqCandidate | null>(null);

  // A single shared <audio> element for every candidate's preview clip
  // rather than one per row — only one can ever be playing at a time, and
  // reusing one element means switching candidates just swaps `.src` instead
  // of juggling N separate playback states. `playingKey` (the same
  // provider-artist-title key each row is already keyed by) is what the
  // per-row play/stop icon reflects.
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const togglePreview = (e: React.MouseEvent, key: string, url: string) => {
    e.stopPropagation(); // don't also trigger the row's own onClick (opens the rename confirm)
    const audio = audioRef.current;
    if (!audio) return;
    if (playingKey === key) {
      audio.pause();
      return;
    }
    audio.src = url;
    audio.play().catch(() => {}); // e.g. blocked by the browser's autoplay policy — nothing to recover from
    setPlayingKey(key);
  };

  // Original YouTube title vs. what the track is actually stored as right
  // now — these drift apart over time (a manual rename, or metadata
  // resolution cleaning up the raw upload title), and the candidates below
  // are matched against the CURRENT name, not the YouTube one, so showing
  // both when they've diverged is what actually explains why a given
  // candidate looked close enough to suggest.
  const originalLabel = video.originalTitle ?? video.title;
  const currentLabel = video.artist ? `${video.artist} - ${video.title}` : video.title;
  const currentDiffersFromOriginal = currentLabel.trim().toLowerCase() !== originalLabel.trim().toLowerCase();

  return (
    <>
      <Dialog open={candidates.length > 0 && !selected} onClose={onDismiss} maxWidth="sm" fullWidth>
        <DialogTitle>{t('playlists.videoList.closeHqCandidates.title')}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>{t('playlists.videoList.closeHqCandidates.infoBox')}</Alert>

          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: currentDiffersFromOriginal ? 1.5 : 2 }}>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('playlists.videoList.originalTitle')}
              </Typography>
              <Typography variant="body2" noWrap title={originalLabel} sx={{ color: 'text.primary' }}>
                {originalLabel}
                {video.duration ? ` (${formatDuration(video.duration)})` : ''}
              </Typography>
            </Box>
            <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
              <IconButton size="small" component="a" href={youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer">
                <YouTubeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {currentDiffersFromOriginal && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('playlists.videoList.currentTrack')}
              </Typography>
              <Typography variant="body2" noWrap title={currentLabel} sx={{ color: 'text.primary' }}>
                {currentLabel}
              </Typography>
            </Box>
          )}

          <List disablePadding>
            {candidates.map((c) => {
              const key = `${c.provider}-${c.artist}-${c.title}`;
              const isPlaying = playingKey === key;
              return (
                <ListItemButton
                  key={key}
                  onClick={() => { audioRef.current?.pause(); setSelected(c); }}
                  sx={{ borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: '#2a2a2a' }}
                >
                  {c.previewUrl && (
                    <Tooltip title={t(isPlaying ? 'playlists.videoList.closeHqCandidates.stopPreview' : 'playlists.videoList.closeHqCandidates.preview')}>
                      <IconButton size="small" onClick={(e) => togglePreview(e, key, c.previewUrl!)} sx={{ mr: 1 }}>
                        {isPlaying ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  )}
                  <ListItemText
                    primary={`${c.artist} - ${c.title}`}
                    secondary={c.durationSec ? formatDuration(c.durationSec) : undefined}
                  />
                  <Chip label={PROVIDER_LABEL[c.provider]} size="small" variant="outlined" sx={{ ml: 1 }} />
                </ListItemButton>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onDismiss}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a 30s label-free preview clip, not real content */}
      <audio ref={audioRef} onEnded={() => setPlayingKey(null)} onPause={() => setPlayingKey(null)} style={{ display: 'none' }} />
      {selected && (
        <ConfirmDialog
          title={t('playlists.videoList.closeHqCandidates.confirmTitle')}
          message={t('playlists.videoList.closeHqCandidates.confirmMessage', { name: `${selected.artist} - ${selected.title}` })}
          confirmLabel={t('playlists.videoList.rename')}
          onConfirm={() => { onSelect(selected.artist, selected.title); setSelected(null); }}
          onCancel={() => setSelected(null)}
        />
      )}
    </>
  );
}
