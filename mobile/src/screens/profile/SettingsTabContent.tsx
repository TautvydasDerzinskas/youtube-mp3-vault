import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Switch, Divider, Button, SegmentedButtons, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useServerConfig } from '../../contexts/ServerConfigContext';
import { SUPPORTED_LANGUAGES } from '../../i18n';

// Mirrors web's SettingsTab.tsx — same two sections (language, auto-delete
// non-music), but the language picker uses SegmentedButtons instead of
// web's dropdown <select>: there are only 3 fixed options, so a segmented
// control reads faster on a touch screen than opening a picker menu. The
// server URL row has no web equivalent — mobile-only, since only mobile
// points at a configurable, self-hosted backend address (see
// ServerConfigContext/UpdateServerUrlScreen).
export function SettingsTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const { user, updateLanguage, setAutoDeleteNonMusic, setQobuzHqEnabled } = useAuth();
  const { serverUrl } = useServerConfig();
  const [autoDeleteLoading, setAutoDeleteLoading] = useState(false);
  const [qobuzLoading, setQobuzLoading] = useState(false);

  const handleToggleAutoDelete = async (enabled: boolean) => {
    setAutoDeleteLoading(true);
    try {
      await setAutoDeleteNonMusic(enabled);
    } finally {
      setAutoDeleteLoading(false);
    }
  };

  const handleToggleQobuz = async (enabled: boolean) => {
    setQobuzLoading(true);
    try {
      await setQobuzHqEnabled(enabled);
    } finally {
      setQobuzLoading(false);
    }
  };

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
          {t('profile.settings.qobuzHq.label')}
        </Text>
        <Switch
          value={user?.qobuzHqEnabled ?? false}
          disabled={qobuzLoading}
          onValueChange={handleToggleQobuz}
        />
      </View>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('profile.settings.qobuzHq.description')}
      </Text>

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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  actionText: { flexShrink: 1 },
});
