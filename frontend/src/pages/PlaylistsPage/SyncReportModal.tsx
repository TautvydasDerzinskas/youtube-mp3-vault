import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Stack, Tooltip } from '@mui/material';
import { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { SyncReport, syncReportsApi } from '../../api/syncReports';

// Capped so a run with a lot of failures doesn't turn the dialog into a
// full-screen list — scrolls independently within this height instead.
const FAILURE_LIST_MAX_HEIGHT = 140;

interface Props {
  // Queue of unseen reports, oldest first — shown one at a time so a burst
  // of runs from before the user last opened this page doesn't dump every
  // stat on screen at once.
  reports: SyncReport[];
  // Called once every report in the queue has been acknowledged.
  onDone: () => void;
}

// Single largest applicable unit, same minimal style as timeAgo in ./utils —
// a run this modal reports on is usually seconds to a few minutes, so
// anything more precise than one unit wouldn't add useful information.
function formatDuration(ms: number, t: TFunction): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return t('playlists.syncReport.durationSeconds', { count: totalSeconds });
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return t('playlists.syncReport.durationMinutes', { count: totalMinutes });
  return t('playlists.syncReport.durationHours', { count: Math.round(totalMinutes / 60) });
}

function StatRow({ text }: { text: string }) {
  return (
    <Typography variant="body2" sx={{ py: 0.25 }}>
      • {text}
    </Typography>
  );
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

  const rows: string[] = [];
  if (current.addedCount > 0) rows.push(t('playlists.syncReport.added', { count: current.addedCount }));
  if (current.removedCount > 0) rows.push(t('playlists.syncReport.removed', { count: current.removedCount }));
  if (current.downloadedCount > 0) rows.push(t('playlists.syncReport.downloaded', { count: current.downloadedCount }));
  if (current.recoveredCount > 0) rows.push(t('playlists.syncReport.recovered', { count: current.recoveredCount }));
  if (current.newHqCount > 0) rows.push(t('playlists.syncReport.newHq', { count: current.newHqCount }));

  const failureRows = Object.entries(current.failureReasons)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${t(`playlists.syncReport.failureReason.${reason}`)}: ${count}`);

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
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {current.playlistName} · {formatDuration(current.durationMs, t)}
        </Typography>

        {rows.length === 0 && current.failedCount === 0 ? (
          <Typography color="text.secondary" sx={{ py: 1 }}>{t('playlists.syncReport.nothingChanged')}</Typography>
        ) : (
          <Stack sx={{ mt: 1 }}>
            {rows.map((text) => <StatRow key={text} text={text} />)}
            {current.failedCount > 0 && (
              <>
                <StatRow text={t('playlists.syncReport.failed', { count: current.failedCount })} />
                <Box sx={{ pl: 2.5 }}>
                  {failureRows.map((text) => (
                    <Typography key={text} variant="body2" color="text.secondary" sx={{ py: 0.1 }}>
                      {text}
                    </Typography>
                  ))}
                </Box>
                {current.failureDetails.length > 0 && (
                  <Box sx={{ pl: 2.5, mt: 0.5, maxHeight: FAILURE_LIST_MAX_HEIGHT, overflowY: 'auto' }}>
                    {current.failureDetails.map((f, i) => (
                      <Tooltip key={`${f.title}-${i}`} title={f.message} placement="top" arrow enterTouchDelay={0}>
                        <Typography variant="caption" color="text.secondary" noWrap
                          sx={{ display: 'block', cursor: 'help', textDecoration: 'underline dotted' }}>
                          {f.title} — {t(`playlists.syncReport.failureReason.${f.reason}`)}
                        </Typography>
                      </Tooltip>
                    ))}
                  </Box>
                )}
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleAcknowledge} variant="contained" disabled={acknowledging}>
          {index + 1 < reports.length ? t('playlists.syncReport.next') : t('playlists.syncReport.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
