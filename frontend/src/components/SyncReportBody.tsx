import { Box, Typography, Stack, Tooltip } from '@mui/material';
import { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { SyncReport } from '../api/syncReports';

// Capped so a run with a lot of failures doesn't turn the container into a
// huge list — scrolls independently within this height instead.
const FAILURE_LIST_MAX_HEIGHT = 140;

// Single largest applicable unit, same minimal style as timeAgo in
// PlaylistsPage/utils — a run this reports on is usually seconds to a few
// minutes, so anything more precise than one unit wouldn't add information.
export function formatSyncReportDuration(ms: number, t: TFunction): string {
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

interface SyncReportBodyProps {
  report: SyncReport;
}

// Shared stats rendering for one SyncReport — used by both the live
// SyncReportModal (see PlaylistsPage, shown when a run finishes while that
// page is open) and the notification bell's expanded dropdown row (see
// NotificationBell, for everything else), so the two surfaces never drift.
export function SyncReportBody({ report }: SyncReportBodyProps) {
  const { t } = useTranslation();

  const rows: string[] = [];
  if (report.addedCount > 0) rows.push(t('playlists.syncReport.added', { count: report.addedCount }));
  if (report.removedCount > 0) rows.push(t('playlists.syncReport.removed', { count: report.removedCount }));
  if (report.downloadedCount > 0) rows.push(t('playlists.syncReport.downloaded', { count: report.downloadedCount }));
  if (report.recoveredCount > 0) rows.push(t('playlists.syncReport.recovered', { count: report.recoveredCount }));
  if (report.newHqCount > 0) rows.push(t('playlists.syncReport.newHq', { count: report.newHqCount }));

  const failureRows = Object.entries(report.failureReasons)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${t(`playlists.syncReport.failureReason.${reason}`)}: ${count}`);

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        {report.playlistName} · {formatSyncReportDuration(report.durationMs, t)}
      </Typography>

      {rows.length === 0 && report.failedCount === 0 ? (
        <Typography color="text.secondary" sx={{ py: 1 }}>{t('playlists.syncReport.nothingChanged')}</Typography>
      ) : (
        <Stack sx={{ mt: 1 }}>
          {rows.map((text) => <StatRow key={text} text={text} />)}
          {report.failedCount > 0 && (
            <>
              <StatRow text={t('playlists.syncReport.failed', { count: report.failedCount })} />
              <Box sx={{ pl: 2.5 }}>
                {failureRows.map((text) => (
                  <Typography key={text} variant="body2" color="text.secondary" sx={{ py: 0.1 }}>
                    {text}
                  </Typography>
                ))}
              </Box>
              {report.failureDetails.length > 0 && (
                <Box sx={{ pl: 2.5, mt: 0.5, maxHeight: FAILURE_LIST_MAX_HEIGHT, overflowY: 'auto' }}>
                  {report.failureDetails.map((f, i) => (
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
    </Box>
  );
}
