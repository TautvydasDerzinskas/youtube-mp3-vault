import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Alert, Box, Typography, IconButton, Tooltip,
} from '@mui/material';
import { YouTube as YouTubeIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { youtubeWatchUrl } from '../pages/PlaylistsPage/utils';

interface SuggestedName {
  artist: string | null;
  title: string;
}

interface RenameTrackDialogProps {
  playlistId: string;
  video: PlaylistVideo;
  open: boolean;
  onClose: () => void;
  // Kicks off the actual rename (POST + the row's own polling/spinning-
  // border lifecycle, same as Search for HQ) — this dialog only awaits it
  // long enough to know whether the initial request succeeded, not the full
  // background metadata/HQ-search follow-up, so it can close right away and
  // let the row itself carry the rest of the "in progress" indicator.
  onRename: (artist: string | null, title: string) => Promise<void>;
}

/**
 * The "Rename track" modal — lets the user correct a badly auto-parsed
 * artist/title, since good naming is what both MusicBrainz matching and the
 * HQ provider search actually key off. Shows the original YouTube title
 * (with a link out) for reference, a locally-derived suggested artist/title
 * when it differs from what's currently stored, and editable fields
 * prefilled with the current values.
 */
export function RenameTrackDialog({ playlistId, video, open, onClose, onRename }: RenameTrackDialogProps) {
  const { t } = useTranslation();
  const [artist, setArtist] = useState(video.artist ?? '');
  const [title, setTitle] = useState(video.title);
  const [suggested, setSuggested] = useState<SuggestedName | 'loading' | 'error'>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setArtist(video.artist ?? '');
    setTitle(video.title);
    setError(null);
    setSuggested('loading');
    playlistsApi.getSuggestedName(playlistId, video.id).then(setSuggested).catch(() => setSuggested('error'));
    // video.artist/video.title deliberately excluded — only re-prime the
    // form when the dialog actually (re)opens, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playlistId, video.id]);

  const suggestedResult = suggested !== 'loading' && suggested !== 'error' ? suggested : null;
  // Only worth showing if it'd actually change something — a suggestion
  // identical to what's already stored has nothing to offer.
  const hasSuggestion = suggestedResult !== null
    && (suggestedResult.artist !== video.artist || suggestedResult.title !== video.title);
  const suggestedMatchesInputs = suggestedResult !== null
    && (suggestedResult.artist ?? '') === artist.trim() && suggestedResult.title === title.trim();

  const handleUseSuggested = () => {
    if (!suggestedResult) return;
    setArtist(suggestedResult.artist ?? '');
    setTitle(suggestedResult.title);
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSubmitting(true);
    setError(null);
    try {
      await onRename(artist.trim() || null, trimmedTitle);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('playlists.videoList.renameError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('playlists.videoList.renameTrack')}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>{t('playlists.videoList.renameInfoBox')}</Alert>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="body2" color="text.secondary" noWrap title={video.originalTitle ?? video.title} sx={{ minWidth: 0, flexGrow: 1 }}>
            {t('playlists.videoList.originalTitle')}: {video.originalTitle ?? video.title}
          </Typography>
          <Tooltip title={t('playlists.videoList.watchOnYouTube')}>
            <IconButton size="small" component="a" href={youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer">
              <YouTubeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {hasSuggestion && suggestedResult && (
          <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {t('playlists.videoList.suggestedName')}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {suggestedResult.artist ? `${suggestedResult.artist} - ${suggestedResult.title}` : suggestedResult.title}
            </Typography>
            <Button size="small" onClick={handleUseSuggested} disabled={suggestedMatchesInputs}>
              {t('playlists.videoList.useSuggested')}
            </Button>
          </Box>
        )}

        <TextField
          label={t('playlists.videoList.artistLabel')}
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          fullWidth
          disabled={submitting}
          sx={{ mb: 2 }}
        />
        <TextField
          label={t('playlists.videoList.titleLabel')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          required
          disabled={submitting}
        />

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting || !title.trim()}>
          {t('playlists.videoList.rename')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
