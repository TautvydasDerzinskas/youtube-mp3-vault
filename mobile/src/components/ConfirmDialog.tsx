import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Mirrors frontend/src/components/ConfirmDialog.tsx — shared by the delete
// and generate-similar confirmation flows on PlaylistsScreen.
export function ConfirmDialog({ visible, title, message, confirmLabel, cancelLabel, loading, destructive, onConfirm, onCancel }: ConfirmDialogProps) {
  const theme = useTheme();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content><Text>{message}</Text></Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button onPress={onConfirm} loading={loading} textColor={destructive ? theme.colors.error : undefined}>
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
