import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Switch, Text } from 'react-native-paper';

interface ScanHqDialogProps {
  title: string;
  message: string;
  matchDurationLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  onConfirm: (matchDuration: boolean) => void;
  onCancel: () => void;
}

// Mirrors frontend/src/pages/PlaylistsPage/ScanHqDialog.tsx — confirms the
// whole-playlist "Scan for HQ" action, with a toggle for whether the scan
// should still require a candidate's playback length to be within tolerance
// of the stored video duration. On (default) matches today's behavior; off
// relaxes every track in this pass the same way the single-track "Search for
// HQ" action already always does (see checkVideoQuality's trustedName param
// in slskdQualityWorker.ts).
export function ScanHqDialog({ title, message, matchDurationLabel, confirmLabel, cancelLabel, loading, onConfirm, onCancel }: ScanHqDialogProps) {
  const [matchDuration, setMatchDuration] = useState(true);

  return (
    <Portal>
      <Dialog visible onDismiss={onCancel}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text>{message}</Text>
          <View style={styles.switchRow}>
            <Text variant="bodyLarge" style={styles.switchLabel}>{matchDurationLabel}</Text>
            <Switch value={matchDuration} disabled={loading} onValueChange={setMatchDuration} />
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button onPress={() => onConfirm(matchDuration)} loading={loading}>{confirmLabel}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  switchLabel: { flex: 1, marginRight: 12 },
});
