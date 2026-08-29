import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, FormControlLabel, Switch } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface ScanHqDialogProps {
  loading: boolean;
  onConfirm: (matchDuration: boolean) => void;
  onCancel: () => void;
}

// Confirms the whole-playlist "Scan for HQ" action, with a toggle for
// whether the scan should still require a candidate's playback length to be
// within tolerance of the stored video duration. On (default) matches
// today's behavior; off relaxes every track in this pass the same way the
// single-track "Search for HQ" action already always does (see
// checkVideoQuality's trustedName param in slskdQualityWorker.ts).
export function ScanHqDialog({ loading, onConfirm, onCancel }: ScanHqDialogProps) {
  const { t } = useTranslation();
  const [matchDuration, setMatchDuration] = useState(true);

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{t('playlists.scanHqConfirm.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('playlists.scanHqConfirm.message')}</DialogContentText>
        <FormControlLabel
          sx={{ mt: 1.5 }}
          control={<Switch checked={matchDuration} onChange={e => setMatchDuration(e.target.checked)} disabled={loading} />}
          label={t('playlists.scanHqConfirm.matchDurationLabel')}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={loading}>{t('common.cancel')}</Button>
        <Button onClick={() => onConfirm(matchDuration)} variant="contained" disabled={loading}>
          {t('playlists.scanHq')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
