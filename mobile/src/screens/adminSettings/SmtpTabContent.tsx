import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { adminApi, SmtpSettings } from '../../api/admin';

interface SmtpTabContentProps {
  smtp: SmtpSettings;
  onSaved: (smtp: SmtpSettings) => void;
}

// Mirrors web's SettingsPage SMTP form (one section of one long page there;
// its own tab here — see AdminSettingsScreen).
export function SmtpTabContent({ smtp, onSaved }: SmtpTabContentProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState(smtp);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await adminApi.updateSmtpSettings(draft);
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
        {t('adminSettings.smtp.description')}
      </Text>

      <TextInput
        mode="outlined"
        label={t('adminSettings.smtp.host')}
        value={draft.host ?? ''}
        onChangeText={(v) => setDraft({ ...draft, host: v || null })}
        placeholder="smtp.example.com"
        style={styles.field}
      />
      <TextInput
        mode="outlined"
        label={t('adminSettings.smtp.port')}
        value={String(draft.port)}
        onChangeText={(v) => setDraft({ ...draft, port: Number(v) || 587 })}
        keyboardType="number-pad"
        style={styles.field}
      />
      <View style={styles.switchRow}>
        <Text variant="bodyLarge" style={{ flex: 1 }}>{t('adminSettings.smtp.secure')}</Text>
        <Switch value={draft.secure} onValueChange={(v) => setDraft({ ...draft, secure: v })} />
      </View>
      <TextInput
        mode="outlined"
        label={t('adminSettings.smtp.user')}
        value={draft.user ?? ''}
        onChangeText={(v) => setDraft({ ...draft, user: v || null })}
        style={styles.field}
      />
      <TextInput
        mode="outlined"
        label={t('adminSettings.smtp.pass')}
        value={draft.pass ?? ''}
        onChangeText={(v) => setDraft({ ...draft, pass: v || null })}
        secureTextEntry
        style={styles.field}
      />
      <TextInput
        mode="outlined"
        label={t('adminSettings.smtp.from')}
        value={draft.from}
        onChangeText={(v) => setDraft({ ...draft, from: v })}
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
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  banner: { marginBottom: 12 },
  saveButton: { alignSelf: 'flex-start', marginTop: 4 },
});
