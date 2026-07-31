import { useState } from 'react';
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../api/playlists';
import { displayName } from '../../utils/format';

interface RenameDialogProps {
  playlist: Playlist;
  onClose: () => void;
  onRename: (id: string, customName: string | null) => Promise<void>;
}

// Mirrors frontend/src/pages/PlaylistsPage/RenameDialog.tsx — an empty
// value clears back to the original YouTube title (customName: null).
export function RenameDialog({ playlist, onClose, onRename }: RenameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(playlist.customName ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await onRename(playlist.id, value.trim() || null);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('playlists.renameDialog.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={loading ? undefined : onClose}>
        <Dialog.Title>{t('playlists.renameDialog.title')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t('playlists.renameDialog.displayNameLabel')}
            placeholder={displayName(playlist)}
            value={value}
            onChangeText={setValue}
            disabled={loading}
          />
          <HelperText type="info" visible>{t('playlists.renameDialog.helperText')}</HelperText>
          <HelperText type="error" visible={error != null}>{error}</HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button onPress={handleSubmit} loading={loading}>{t('common.save')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
