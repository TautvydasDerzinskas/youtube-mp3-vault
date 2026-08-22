import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput, Button, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

// Unlike LastfmTabContent, Deezer needs no web-only OAuth redirect dance —
// connecting is just pasting a cookie value and calling an API, which works
// identically on mobile — so this is a full port of web's DeezerTab.tsx,
// not a read-only mirror of it.
export function DeezerTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, saveDeezerCookie, disconnectDeezer } = useAuth();
  const [cookieInput, setCookieInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSave = async () => {
    const trimmed = cookieInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveDeezerCookie(trimmed);
      setCookieInput('');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectDeezer();
    } finally {
      setDisconnecting(false);
    }
  };

  const statusText = user?.deezerCookieValid === false
    ? t('profile.deezer.connectedInvalid')
    : user?.deezerCookieValid === true
      ? t('profile.deezer.connectedValid')
      : t('profile.deezer.connectedUnknown');

  return (
    <View>
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {t('profile.deezer.description')}
      </Text>

      {user?.deezerConnected && (
        <Text
          variant="bodyMedium"
          style={[styles.status, { color: user.deezerCookieValid === false ? theme.colors.error : theme.colors.onSurfaceVariant }]}
        >
          {statusText}
        </Text>
      )}

      <TextInput
        mode="outlined"
        label={t('profile.deezer.cookieLabel')}
        placeholder={t('profile.deezer.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        value={cookieInput}
        onChangeText={setCookieInput}
        style={styles.input}
      />
      <Text variant="bodySmall" style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>
        {t('profile.deezer.cookieHelper')}
      </Text>

      <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving || !cookieInput.trim()} style={styles.saveButton}>
        {t('profile.deezer.save')}
      </Button>

      {user?.deezerConnected && (
        <Button mode="outlined" textColor={theme.colors.error} disabled={disconnecting} onPress={handleDisconnect}>
          {t('profile.deezer.disconnect')}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  description: { marginBottom: 16 },
  status: { marginBottom: 16 },
  input: { marginBottom: 4 },
  helper: { marginBottom: 16 },
  saveButton: { marginBottom: 8 },
});
