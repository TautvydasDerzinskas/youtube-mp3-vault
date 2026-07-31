import { useState } from 'react';
import { ActivityIndicator, Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { playlistsApi, Playlist } from '../../api/playlists';

interface AddPlaylistDialogProps {
  visible: boolean;
  onClose: () => void;
  onAdded: (playlist: Playlist) => void;
}

// Mirrors frontend/src/pages/PlaylistsPage/AddPlaylistDialog.tsx — just a
// URL field (required) and an optional custom name, no sync-option toggles.
export function AddPlaylistDialog({ visible, onClose, onAdded }: AddPlaylistDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (loading) return;
    setUrl('');
    setName('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { playlist } = await playlistsApi.add(url.trim(), name.trim() || undefined);
      onAdded(playlist);
      setUrl('');
      setName('');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('playlists.addDialog.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose}>
        <Dialog.Title>{t('playlists.addDialog.title')}</Dialog.Title>
        <Dialog.Content style={{ gap: 8 }}>
          <TextInput
            mode="outlined"
            label={t('playlists.addDialog.urlLabel')}
            placeholder="https://www.youtube.com/playlist?list=…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={url}
            onChangeText={setUrl}
            disabled={loading}
          />
          <TextInput
            mode="outlined"
            label={t('playlists.addDialog.nameLabel')}
            placeholder={t('playlists.addDialog.namePlaceholder')}
            value={name}
            onChangeText={setName}
            disabled={loading}
          />
          <HelperText type="error" visible={error != null}>{error}</HelperText>
          {loading && <ActivityIndicator style={{ alignSelf: 'flex-start' }} />}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button onPress={handleSubmit} loading={loading} disabled={url.trim().length === 0 || loading}>
            {t('playlists.addDialog.add')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
