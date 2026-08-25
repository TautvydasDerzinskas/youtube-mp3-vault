import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput, Button, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

// Unlike Deezer's cookie paste, Qobuz has no browser-copyable session token
// a user could hand us — connecting is a real email/password login, which
// works identically on mobile — so this is a full port of web's
// QobuzTab.tsx, not a read-only mirror of it.
export function QobuzTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, saveQobuzCredentials, disconnectQobuz } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSave = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    setSaving(true);
    try {
      await saveQobuzCredentials(trimmedEmail, password);
      setEmail('');
      setPassword('');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectQobuz();
    } finally {
      setDisconnecting(false);
    }
  };

  const statusText = user?.qobuzCredentialsValid === false
    ? t('profile.qobuz.connectedInvalid')
    : user?.qobuzCredentialsValid === true
      ? t('profile.qobuz.connectedValid')
      : t('profile.qobuz.connectedUnknown');

  return (
    <View>
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {t('profile.qobuz.description')}
      </Text>

      {user?.qobuzConnected && (
        <Text
          variant="bodyMedium"
          style={[styles.status, { color: user.qobuzCredentialsValid === false ? theme.colors.error : theme.colors.onSurfaceVariant }]}
        >
          {statusText}
        </Text>
      )}

      <TextInput
        mode="outlined"
        label={t('profile.qobuz.emailLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        mode="outlined"
        label={t('profile.qobuz.passwordLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving || !email.trim() || !password} style={styles.saveButton}>
        {t('profile.qobuz.save')}
      </Button>

      {user?.qobuzConnected && (
        <Button mode="outlined" textColor={theme.colors.error} disabled={disconnecting} onPress={handleDisconnect}>
          {t('profile.qobuz.disconnect')}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  description: { marginBottom: 16 },
  status: { marginBottom: 16 },
  input: { marginBottom: 12 },
  saveButton: { marginBottom: 8 },
});
