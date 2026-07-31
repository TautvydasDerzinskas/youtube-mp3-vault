import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useServerConfig } from '../contexts/ServerConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useServerUrlTest } from '../hooks/useServerUrlTest';

// Reached from SettingsTabContent's "Server URL" row — same connection
// test as the first-run ServerSetupScreen (see useServerUrlTest), but this
// one runs while already signed in, so confirming it also logs the user
// out: the current session's token belongs to the old server and has no
// meaning against a different one, and there's no server-side session
// migration to speak of. logout() runs before setServerUrl() so its
// best-effort audit-log call still hits the server the token is actually
// valid for.
export function UpdateServerUrlScreen() {
  const { t } = useTranslation();
  const { serverUrl, setServerUrl } = useServerConfig();
  const { logout } = useAuth();
  const { testing, error, test } = useServerUrlTest();
  const [url, setUrl] = useState(serverUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);

  const handleTest = async () => {
    const normalized = await test(url);
    if (normalized) setConfirmUrl(normalized);
  };

  const handleConfirm = async () => {
    if (!confirmUrl) return;
    setSaving(true);
    try {
      await logout();
      await setServerUrl(confirmUrl);
    } finally {
      setSaving(false);
      setConfirmUrl(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <TextInput
          mode="outlined"
          label={t('serverSetup.urlLabel')}
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
          {t('serverSetup.testConnection')}
        </Button>
      </View>

      <Portal>
        <Dialog visible={confirmUrl != null} onDismiss={() => setConfirmUrl(null)}>
          <Dialog.Title>{t('serverSetup.confirmTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {t('serverSetup.confirmBodyChange', { url: confirmUrl })}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmUrl(null)} disabled={saving}>{t('serverSetup.cancel')}</Button>
            <Button onPress={handleConfirm} loading={saving}>{t('serverSetup.confirm')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  input: { marginBottom: 4 },
});
