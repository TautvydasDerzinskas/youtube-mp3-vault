import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Switch, Divider, SegmentedButtons, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORTED_LANGUAGES } from '../../i18n';

// Mirrors web's SettingsTab.tsx — same two sections (language, auto-delete
// non-music), but the language picker uses SegmentedButtons instead of
// web's dropdown &lt;select&gt;: there are only 3 fixed options, so a segmented
// control reads faster on a touch screen than opening a picker menu.
export function SettingsTabContent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, updateLanguage, setAutoDeleteNonMusic } = useAuth();
  const [autoDeleteLoading, setAutoDeleteLoading] = useState(false);

  const handleToggleAutoDelete = async (enabled: boolean) => {
    setAutoDeleteLoading(true);
    try {
      await setAutoDeleteNonMusic(enabled);
    } finally {
      setAutoDeleteLoading(false);
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
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  segmented: { marginBottom: 20 },
  divider: { marginBottom: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1 },
});
