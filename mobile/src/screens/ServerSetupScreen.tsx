import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useServerConfig } from '../contexts/ServerConfigContext';
import { DEFAULT_API_URL, isCompleteServerUrl, normalizeServerUrl } from '../config';

export function ServerSetupScreen() {
  const { t } = useTranslation();
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
      setError(t('serverSetup.enterAddress'));
      return;
    }
    if (!isCompleteServerUrl(trimmed)) {
      setError(t('serverSetup.invalidUrl'));
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
      setError(status ? t('serverSetup.serverError', { status }) : t('serverSetup.unreachable'));
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
        <Text variant="headlineMedium" style={styles.title}>{t('auth.appName')}</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {t('serverSetup.subtitle')}
        </Text>

        <TextInput
          mode="outlined"
          label={t('serverSetup.urlLabel')}
          placeholder={`${DEFAULT_API_URL.replace(/\/api$/, '')} or http://192.168.1.50:8065`}
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
              {t('serverSetup.confirmBody', { url: confirmUrl })}
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
  title: { textAlign: 'center', marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: 24 },
  input: { marginBottom: 4 },
});
