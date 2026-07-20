import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import axios from 'axios';
import { useServerConfig } from '../contexts/ServerConfigContext';
import { DEFAULT_API_URL, normalizeServerUrl } from '../config';

export function ServerSetupScreen() {
  const { setServerUrl } = useServerConfig();
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);

  const handleTest = async () => {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError('Enter the address of your YoutubeVault service.');
      return;
    }

    const normalized = normalizeServerUrl(trimmed);
    setTesting(true);
    try {
      const { data } = await axios.get(`${normalized}/health`, { timeout: 8000 });
      if (data?.status !== 'ok') throw new Error('unexpected health response');
      setConfirmUrl(normalized);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status
          ? `Server responded with an error (${status}). Check the address.`
          : 'Could not reach that server. Check the address and your connection.',
      );
    } finally {
      setTesting(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmUrl) return;
    setSaving(true);
    try {
      await setServerUrl(confirmUrl);
    } finally {
      setSaving(false);
      setConfirmUrl(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text variant="headlineMedium" style={styles.title}>YoutubeVault</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Enter the address of your YoutubeVault service to get started.
        </Text>

        <TextInput
          mode="outlined"
          label="Service URL"
          placeholder={DEFAULT_API_URL.replace(/\/api$/, '')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          style={styles.input}
        />
        <HelperText type="error" visible={error != null}>
          {error}
        </HelperText>

        <Button mode="contained" onPress={handleTest} loading={testing} disabled={testing || url.trim().length === 0}>
          Test Connection
        </Button>
      </View>

      <Portal>
        <Dialog visible={confirmUrl != null} onDismiss={() => setConfirmUrl(null)}>
          <Dialog.Title>Save this server?</Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirmUrl} will be permanently saved and used by this app. Continue?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmUrl(null)} disabled={saving}>Cancel</Button>
            <Button onPress={handleConfirm} loading={saving}>Confirm</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { textAlign: 'center', marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: 24 },
  input: { marginBottom: 4 },
});
