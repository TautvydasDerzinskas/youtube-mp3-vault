import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Switch, Divider, Button, SegmentedButtons, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useServerConfig } from '../../contexts/ServerConfigContext';
import { SUPPORTED_LANGUAGES } from '../../i18n';

// Mirrors web's SettingsTab.tsx — same sections (language, auto-delete
// non-music, share now-playing status), but the language picker uses
// SegmentedButtons instead of web's dropdown <select>: there are only 3
// fixed options, so a segmented control reads faster on a touch screen than
// opening a picker menu. The server URL row has no web equivalent —
// mobile-only, since only mobile points at a configurable, self-hosted
// backend address (see ServerConfigContext/UpdateServerUrlScreen).
export function SettingsTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { user, updateLanguage, setAutoDeleteNonMusic, setNowPlayingPublic } = useAuth();
  const { serverUrl } = useServerConfig();
  const [autoDeleteLoading, setAutoDeleteLoading] = useState(false);
  const [nowPlayingLoading, setNowPlayingLoading] = useState(false);

  const handleToggleAutoDelete = async (enabled: boolean) => {
    setAutoDeleteLoading(true);
    try {
      await setAutoDeleteNonMusic(enabled);
    } finally {
      setAutoDeleteLoading(false);
    }
  };

  const handleToggleNowPlaying = async (enabled: boolean) => {
    setNowPlayingLoading(true);
    try {
      await setNowPlayingPublic(enabled);
    } finally {
      setNowPlayingLoading(false);
    }
  };

  // serverUrl (see ServerConfigContext/normalizeServerUrl) already ends in
  // `/api`, matching how web builds the same URL off window.location.origin.
  const nowPlayingUrl = user && serverUrl
    ? `${serverUrl}/now-playing?email=${encodeURIComponent(user.email)}`
    : '';

  return (
    <View>
      <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
        {t('profile.language')}
      </Text>
      <SegmentedButtons
        value={user?.language ?? 'en'}
        onValueChange={(value) => updateLanguage(value)}
        buttons={SUPPORTED_LANGUAGES.map((code) => ({ value: code, label: code.toUpperCase() }))}
        style={styles.segmented}
      />

      <Divider style={styles.divider} />

      <View style={styles.switchRow}>
        <Text variant="bodyLarge" style={styles.switchLabel}>
          {t('profile.settings.autoDeleteNonMusic.label')}
        </Text>
        <Switch
          value={user?.autoDeleteNonMusicEnabled ?? false}
          disabled={autoDeleteLoading}
          onValueChange={handleToggleAutoDelete}
        />
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('profile.settings.autoDeleteNonMusic.description')}
      </Text>

      <Divider style={styles.divider2} />

      <View style={styles.switchRow}>
        <Text variant="bodyLarge" style={styles.switchLabel}>
          {t('profile.settings.nowPlayingPublic.label')}
        </Text>
        <Switch
          value={user?.nowPlayingPublic ?? false}
          disabled={nowPlayingLoading}
          onValueChange={handleToggleNowPlaying}
        />
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('profile.settings.nowPlayingPublic.description')}
      </Text>
      {user?.nowPlayingPublic && (
        <View style={styles.nowPlayingUsage}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('profile.settings.nowPlayingPublic.usage')}
          </Text>
          <Text
            variant="bodySmall"
            selectable
            style={[styles.nowPlayingUrl, { backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurfaceVariant }]}
          >
            {nowPlayingUrl}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('profile.settings.nowPlayingPublic.exampleResponse')}
          </Text>
        </View>
      )}

      <Divider style={styles.divider2} />

      <View style={styles.actionRow}>
        <View style={styles.actionText}>
          <Text variant="bodyLarge">{t('profile.settings.serverUrl.label')}</Text>
          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
            {serverUrl}
          </Text>
        </View>
        <Button mode="text" onPress={() => navigation.navigate('UpdateServerUrl')}>
          {t('profile.settings.serverUrl.change')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  segmented: { marginBottom: 20 },
  divider: { marginBottom: 16 },
  divider2: { marginTop: 20, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1 },
  nowPlayingUsage: { marginTop: 10, gap: 6 },
  nowPlayingUrl: { padding: 10, borderRadius: 6, fontFamily: 'monospace' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  actionText: { flexShrink: 1 },
});
