import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { SyncReport, syncReportsApi } from '../../api/syncReports';

interface Props {
  // Queue of unseen reports, oldest first — shown one at a time so a burst
  // of runs from before the user last opened the app doesn't dump every
  // stat on screen at once.
  reports: SyncReport[];
  // Called once every report in the queue has been acknowledged.
  onDone: () => void;
}

// Single largest applicable unit, same minimal style as timeAgo in
// utils/format.ts — a run this modal reports on is usually seconds to a few
// minutes, so anything more precise than one unit wouldn't add useful
// information.
function formatDuration(ms: number, t: TFunction): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return t('playlists.syncReport.durationSeconds', { count: totalSeconds });
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return t('playlists.syncReport.durationMinutes', { count: totalMinutes });
  return t('playlists.syncReport.durationHours', { count: Math.round(totalMinutes / 60) });
}

// Mirrors frontend/src/pages/PlaylistsPage/SyncReportModal.tsx — same stats,
// same one-at-a-time queue, same seen-tracking, adapted to react-native-paper's
// Dialog/Portal (see components/ConfirmDialog.tsx for the same adaptation).
export function SyncReportModal({ reports, onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
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
    <Portal>
      <Dialog visible onDismiss={handleAcknowledge}>
        <Dialog.Title>{t(`playlists.syncReport.actionTitle.${current.actionType}`)}</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            {current.playlistName} · {formatDuration(current.durationMs, t)}
          </Text>
          {reports.length > 1 && (
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              {t('playlists.syncReport.progress', { current: index + 1, total: reports.length })}
            </Text>
          )}

          {rows.length === 0 && current.failedCount === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 8 }}>
              {t('playlists.syncReport.nothingChanged')}
            </Text>
          ) : (
            <View style={styles.stats}>
              {rows.map((text) => <Text key={text} style={styles.row}>• {text}</Text>)}
              {current.failedCount > 0 && (
                <>
                  <Text style={styles.row}>• {t('playlists.syncReport.failed', { count: current.failedCount })}</Text>
                  <View style={styles.reasons}>
                    {failureRows.map((text) => (
                      <Text key={text} style={[styles.reason, { color: theme.colors.onSurfaceVariant }]}>{text}</Text>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleAcknowledge} loading={acknowledging}>
            {index + 1 < reports.length ? t('playlists.syncReport.next') : t('playlists.syncReport.done')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 13, marginBottom: 6 },
  stats: { marginTop: 4 },
  row: { paddingVertical: 2, fontSize: 14 },
  reasons: { paddingLeft: 14 },
  reason: { fontSize: 12, paddingVertical: 1 },
});
