import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { SyncReport, syncReportsApi } from '../../api/syncReports';
import { SyncReportBody } from '../../components/SyncReportBody';

interface Props {
  // Queue of unseen reports, oldest first — shown one at a time so a burst
  // of runs from before the user last opened this page doesn't dump every
  // stat on screen at once.
  reports: SyncReport[];
  // Called once every report in the queue has been acknowledged.
  onDone: () => void;
}

export function SyncReportModal({ reports, onDone }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);
  const current = reports[index];

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await syncReportsApi.markSeen(current.id);
    } catch (err) {
      // Worst case it just reappears next visit — not worth blocking on.
      console.error('Failed to mark sync report seen:', err);
    } finally {
      setAcknowledging(false);
    }
    if (index + 1 < reports.length) setIndex(index + 1);
    else onDone();
  };

  return (
    <Dialog open onClose={handleAcknowledge} maxWidth="xs" fullWidth>
      <DialogTitle>
        {t(`playlists.syncReport.actionTitle.${current.actionType}`)}
        {reports.length > 1 && (
          <Typography variant="body2" color="text.secondary">
            {t('playlists.syncReport.progress', { current: index + 1, total: reports.length })}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <SyncReportBody report={current} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleAcknowledge} variant="contained" disabled={acknowledging}>
          {index + 1 < reports.length ? t('playlists.syncReport.next') : t('playlists.syncReport.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
