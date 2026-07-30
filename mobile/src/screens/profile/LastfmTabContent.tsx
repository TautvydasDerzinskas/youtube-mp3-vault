import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Switch, Button, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

// Mirrors web's LastfmTab.tsx for the parts that are plain API calls
// (toggling scrobbling, disconnecting) — those work identically on mobile.
// Initiating a *new* connection doesn't: web does it via a full-page
// redirect to Last.fm's OAuth page that relies on cookie-based session
// auth carrying across the redirect chain back to a `/profile?lastfm=...`
// URL. Mobile has no cookie jar shared with an external browser and no
// custom URL scheme configured to receive a deep-link callback, so instead
// of shipping a connect button that can't actually complete, this points
// the user at the web app for that one step.
export function LastfmTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, disconnectLastfm, setScrobbling } = useAuth();
  const [scrobblingLoading, setScrobblingLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleToggleScrobbling = async (enabled: boolean) => {
    setScrobblingLoading(true);
    try {
      await setScrobbling(enabled);
    } finally {
      setScrobblingLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectLastfm();
    } finally {
      setDisconnecting(false);
    }
  };

  if (user?.lastfmUsername) {
    return (
      <View style={styles.connected}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('profile.lastfm.connectedAs', { username: user.lastfmUsername })}
        </Text>
        <View style={styles.switchRow}>
          <Text variant="bodyLarge" style={styles.switchLabel}>{t('profile.lastfm.enableScrobbling')}</Text>
          <Switch value={user.scrobblingEnabled} disabled={scrobblingLoading} onValueChange={handleToggleScrobbling} />
        </View>
        <Button mode="outlined" textColor={theme.colors.error} disabled={disconnecting} onPress={handleDisconnect}>
          {t('profile.lastfm.disconnect')}
        </Button>
      </View>
    );
  }

  return (
    <View>
      <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {t('profile.lastfm.description')}
      </Text>
      <Button mode="contained" disabled style={styles.connectButton}>
        {t('profile.lastfm.connect')}
      </Button>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('profile.lastfm.connectUnavailableOnMobile')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  connected: { gap: 16, alignItems: 'flex-start' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' },
  switchLabel: { flex: 1 },
  description: { marginBottom: 16 },
  connectButton: { alignSelf: 'flex-start', marginBottom: 8 },
});
