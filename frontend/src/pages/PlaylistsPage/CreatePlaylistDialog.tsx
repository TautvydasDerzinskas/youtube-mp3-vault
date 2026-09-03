import { useMemo, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, CircularProgress, Alert, Stack,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, Playlist } from '../../api/youtube';
import { useToast } from '../../contexts/ToastContext';
import { displayName } from './utils';

type LineIssueReason = 'playlistUrl' | 'invalid';

interface LineIssue {
  lineNumber: number; // 1-indexed, matching what the user sees in the textarea
  reason: LineIssueReason;
}

// Same whitespace-adjacent-dash requirement as the backend's own
// splitArtistTitle (services/trackMatching.ts) — a plain mid-word hyphen in
// an artist name ("T-Pain") shouldn't count as an "Artist - Title" split.
// Deliberately a subset of what the backend actually accepts (it also
// allows |/~/•) rather than the full set, so nothing this validation lets
// through can ever fail to parse once it reaches playlistCreator.ts.
const ARTIST_TITLE_RE = /^(.{1,80}?)(?:\s+[-–—]\s*|\s*[-–—]\s+)(.+)$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be', 'music.youtube.com']);

type LineStatus = 'url' | 'playlistUrl' | 'text' | 'invalid';

function classifyLine(line: string): LineStatus {
  let parsed: URL | null = null;
  try {
    parsed = new URL(line);
  } catch {
    parsed = null;
  }

  if (parsed) {
    const host = parsed.hostname.replace(/^www\./, '');
    if (!YOUTUBE_HOSTS.has(host)) return 'invalid';
    if (parsed.searchParams.get('list')) return 'playlistUrl';
    if (host === 'youtu.be') return parsed.pathname.slice(1) ? 'url' : 'invalid';
    if (parsed.pathname.startsWith('/shorts/')) return 'url';
    if (parsed.pathname === '/watch' && parsed.searchParams.get('v')) return 'url';
    return 'invalid';
  }

  return ARTIST_TITLE_RE.test(line) ? 'text' : 'invalid';
}

export function CreatePlaylistDialog({ open, onClose, onAdded }: {
  open: boolean; onClose: () => void; onAdded: (p: Playlist) => void;
}) {
  const { t } = useTranslation();
  const { showSuccess } = useToast();
  const [name, setName] = useState('');
  const [tracks, setTracks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-classified on every keystroke — cheap (a handful of lines, one regex
  // test each) and keeps Create's disabled state and the issue summary below
  // always in sync with what's currently typed.
  const { validLines, issues } = useMemo(() => {
    const validLines: string[] = [];
    const issues: LineIssue[] = [];
    tracks.split('\n').forEach((raw, idx) => {
      const line = raw.trim();
      if (!line) return;
      const status = classifyLine(line);
      if (status === 'url' || status === 'text') {
        validLines.push(line);
      } else {
        issues.push({ lineNumber: idx + 1, reason: status === 'playlistUrl' ? 'playlistUrl' : 'invalid' });
      }
    });
    return { validLines, issues };
  }, [tracks]);

  const reset = () => { setName(''); setTracks(''); setError(null); };
  const handleClose = () => { if (!loading) { reset(); onClose(); } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { playlist } = await playlistsApi.create(name.trim(), validLines);
      reset();
      onAdded(playlist);
      onClose();
      showSuccess(t('playlists.createDialog.created', { name: displayName(playlist) }));
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('playlists.createDialog.genericError'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = name.trim().length > 0 && issues.length === 0;
  // A plain multiline TextField can't highlight individual lines, so invalid
  // ones surface as a summary below it instead — capped so a large paste
  // gone wrong doesn't produce a wall of identical-looking errors.
  const MAX_SHOWN_ISSUES = 3;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('playlists.createDialog.title')}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label={t('playlists.createDialog.nameLabel')}
            value={name}
            onChange={e => setName(e.target.value)}
            required
            fullWidth
            autoFocus
            disabled={loading}
          />

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('playlists.createDialog.tracksHelp')}
            </Typography>
            <TextField
              label={t('playlists.createDialog.tracksLabel')}
              placeholder={t('playlists.createDialog.tracksPlaceholder')}
              value={tracks}
              onChange={e => setTracks(e.target.value)}
              fullWidth
              multiline
              minRows={6}
              maxRows={12}
              disabled={loading}
            />
            {issues.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                <Stack gap={0.5}>
                  {issues.slice(0, MAX_SHOWN_ISSUES).map(issue => (
                    <Typography key={issue.lineNumber} variant="body2">
                      {t(
                        issue.reason === 'playlistUrl'
                          ? 'playlists.createDialog.lineErrorPlaylistUrl'
                          : 'playlists.createDialog.lineErrorInvalid',
                        { line: issue.lineNumber },
                      )}
                    </Typography>
                  ))}
                  {issues.length > MAX_SHOWN_ISSUES && (
                    <Typography variant="body2">
                      {t('playlists.createDialog.moreLineErrors', { count: issues.length - MAX_SHOWN_ISSUES })}
                    </Typography>
                  )}
                </Stack>
              </Alert>
            )}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
          {loading && (
            <Stack direction="row" alignItems="center" gap={1.5}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                {t('playlists.createDialog.creating')}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={loading || !canSubmit}>{t('playlists.createDialog.create')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
