import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Checkbox, Switch, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { adminApi, HqSettings, HqUserProvider, HQ_USER_PROVIDERS } from '../../api/admin';

interface HqTabContentProps {
  hq: HqSettings;
  onSaved: (hq: HqSettings) => void;
}

export function HqTabContent({ hq, onSaved }: HqTabContentProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState(hq);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const persist = async (next: HqSettings) => {
    setDraft(next);
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await adminApi.updateHqSettings(next);
      setDraft(updated);
      onSaved(updated);
      setSaved(true);
    } catch (err: any) {
      setDraft(hq);
      setError(err?.response?.data?.error ?? t('adminSettings.genericError'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (autoDownloadEnabled: boolean) => persist({ ...draft, autoDownloadEnabled });

  const toggleProvider = (provider: HqUserProvider, enabled: boolean) => {
    persist({
      ...draft,
      allowedUserProviders: enabled
        ? [...draft.allowedUserProviders, provider]
        : draft.allowedUserProviders.filter((p) => p !== provider),
    });
  };

  return (
    <View style={styles.section}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        {t('adminSettings.hq.description')}
      </Text>

      <View style={styles.switchRow}>
        <Text variant="bodyLarge" style={{ flex: 1 }}>{t('adminSettings.hq.autoDownloadEnabled')}</Text>
        <Switch value={draft.autoDownloadEnabled} disabled={saving} onValueChange={handleToggle} />
      </View>

      <Text variant="bodyLarge" style={{ marginBottom: 4 }}>{t('adminSettings.hq.allowedUserProviders')}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
        {t('adminSettings.hq.allowedUserProvidersDescription')}
      </Text>
      {HQ_USER_PROVIDERS.map((provider) => (
        <Checkbox.Item
          key={provider}
          label={t(`adminSettings.hq.provider.${provider}`)}
          status={draft.allowedUserProviders.includes(provider) ? 'checked' : 'unchecked'}
          disabled={saving}
          onPress={() => toggleProvider(provider, !draft.allowedUserProviders.includes(provider))}
          style={styles.checkboxItem}
        />
      ))}

      {error && <Banner visible icon="alert-circle-outline" style={styles.banner}>{error}</Banner>}
      {saved && <Banner visible icon="check-circle-outline" style={styles.banner}>{t('adminSettings.saved')}</Banner>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkboxItem: { paddingHorizontal: 0 },
  banner: { marginBottom: 12 },
});
