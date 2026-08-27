import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItemButton, ListItemText, Chip,
  Box, Typography, IconButton, Tooltip, Alert,
} from '@mui/material';
import { YouTube as YouTubeIcon } from '@mui/icons-material';
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
  // Only the original-title/YouTube-link/duration comparison row needs
  // this — see RenameTrackDialog's identical original-title row, which this
  // one is deliberately styled to match.
  video: Pick<PlaylistVideo, 'youtubeId' | 'originalTitle' | 'title' | 'duration'>;
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

  return (
    <>
      <Dialog open={candidates.length > 0 && !selected} onClose={onDismiss} maxWidth="sm" fullWidth>
        <DialogTitle>{t('playlists.videoList.closeHqCandidates.title')}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>{t('playlists.videoList.closeHqCandidates.infoBox')}</Alert>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="body2" color="text.secondary" noWrap title={video.originalTitle ?? video.title} sx={{ minWidth: 0, flexGrow: 1 }}>
              {t('playlists.videoList.originalTitle')}: {video.originalTitle ?? video.title}
              {video.duration ? ` (${formatDuration(video.duration)})` : ''}
            </Typography>
            <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
              <IconButton size="small" component="a" href={youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer">
                <YouTubeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <List disablePadding>
            {candidates.map((c) => (
              <ListItemButton
                key={`${c.provider}-${c.artist}-${c.title}`}
                onClick={() => setSelected(c)}
                sx={{ borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: '#2a2a2a' }}
              >
                <ListItemText
                  primary={`${c.artist} - ${c.title}`}
                  secondary={c.durationSec ? formatDuration(c.durationSec) : undefined}
                />
                <Chip label={PROVIDER_LABEL[c.provider]} size="small" variant="outlined" sx={{ ml: 1 }} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onDismiss}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
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
