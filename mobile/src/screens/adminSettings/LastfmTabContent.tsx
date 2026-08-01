import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { adminApi, LastfmSettings } from '../../api/admin';

interface LastfmTabContentProps {
  lastfm: LastfmSettings;
  onSaved: (lastfm: LastfmSettings) => void;
}

// Instance-wide Last.fm API credentials (distinct from a user's own "Connect
// to Last.fm" in their Profile) — apiKey alone enables Discover; both are
// needed before any user's connect option even appears.
export function LastfmTabContent({ lastfm, onSaved }: LastfmTabContentProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState(lastfm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await adminApi.updateLastfmSettings(draft);
      setDraft(updated);
      onSaved(updated);
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('adminSettings.genericError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        {t('adminSettings.lastfm.description')}
      </Text>

      <TextInput
        mode="outlined"
        label={t('adminSettings.lastfm.apiKey')}
        value={draft.apiKey ?? ''}
        onChangeText={(v) => setDraft({ ...draft, apiKey: v || null })}
        style={styles.field}
      />
      <TextInput
        mode="outlined"
        label={t('adminSettings.lastfm.apiSecret')}
        value={draft.apiSecret ?? ''}
        onChangeText={(v) => setDraft({ ...draft, apiSecret: v || null })}
        secureTextEntry
        style={styles.field}
      />

      {error && <Banner visible icon="alert-circle-outline" style={styles.banner}>{error}</Banner>}
      {saved && <Banner visible icon="check-circle-outline" style={styles.banner}>{t('adminSettings.saved')}</Banner>}

      <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} style={styles.saveButton}>
        {t('adminSettings.save')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 8 },
  field: { marginBottom: 12 },
  banner: { marginBottom: 12 },
  saveButton: { alignSelf: 'flex-start', marginTop: 4 },
});
