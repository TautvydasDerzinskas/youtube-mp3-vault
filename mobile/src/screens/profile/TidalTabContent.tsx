import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text, Button, ActivityIndicator, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { TidalStartResponse } from '../../api/auth';

// Unlike Deezer's cookie paste or Qobuz's email/password form, Tidal has
// nothing a user could type in directly — connecting is the device-code
// flow Tidal's own TV/games-console apps use: the user opens a short link
// and enters a code this screen shows them, and this screen polls the
// backend until that finishes. Full port of web's TidalTab.tsx — see it for
// the fuller rationale.
export function TidalTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, startTidalAuth, pollTidalAuth, disconnectTidal } = useAuth();
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState<TidalStartResponse | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      try {
        const result = await pollTidalAuth();
        if (result.status !== 'pending') {
          clearInterval(id);
          setPending(null);
        }
      } catch {
        // A single network hiccup shouldn't abort the whole flow — just try
        // again on the next tick.
      }
    }, pending.intervalSec * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.userCode]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const auth = await startTidalAuth();
      setPending(auth);
    } finally {
      setStarting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectTidal();
      setPending(null);
    } finally {
      setDisconnecting(false);
    }
  };

  const statusText = user?.tidalCredentialsValid === false
    ? t('profile.tidal.connectedInvalid')
    : user?.tidalCredentialsValid === true
      ? t('profile.tidal.connectedValid')
      : t('profile.tidal.connectedUnknown');

  return (
    <View>
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {t('profile.tidal.description')}
      </Text>

      {user?.tidalConnected && !pending && (
        <Text
          variant="bodyMedium"
          style={[styles.status, { color: user.tidalCredentialsValid === false ? theme.colors.error : theme.colors.onSurfaceVariant }]}
        >
          {statusText}
        </Text>
      )}

      {pending ? (
        <View style={styles.pendingBox}>
          <ActivityIndicator style={styles.spinner} />
          <Text variant="bodyMedium" style={styles.description}>{t('profile.tidal.waitingInstructions')}</Text>
          <Text variant="headlineSmall" style={styles.code}>{pending.userCode}</Text>
          <Button mode="text" onPress={() => Linking.openURL(`https://${pending.verificationUri}`)}>
            {pending.verificationUri}
          </Button>
        </View>
      ) : (
        <Button mode="contained" onPress={handleStart} loading={starting} disabled={starting} style={styles.saveButton}>
          {user?.tidalConnected ? t('profile.tidal.reconnect') : t('profile.tidal.connect')}
        </Button>
      )}

      {user?.tidalConnected && !pending && (
        <Button mode="outlined" textColor={theme.colors.error} disabled={disconnecting} onPress={handleDisconnect}>
          {t('profile.tidal.disconnect')}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  description: { marginBottom: 16 },
  status: { marginBottom: 16 },
  saveButton: { marginBottom: 8 },
  pendingBox: { alignItems: 'center', marginBottom: 16 },
  spinner: { marginBottom: 8 },
  code: { letterSpacing: 4, marginBottom: 8 },
});
