import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Banner, Button, Text, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { adminApi, PostgresSettings } from '../../api/admin';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface PostgresTabContentProps {
  postgres: PostgresSettings;
  onSaved: (postgres: PostgresSettings) => void;
}

// Switches the server's live database connection for every user on this
// instance — genuinely riskier than the other three tabs, so unlike web's
// SettingsPage (immediate submit), this goes through a confirmation step
// first. A bad value here doesn't just fail to save, it can take the whole
// server down for everyone.
export function PostgresTabContent({ postgres, onSaved }: PostgresTabContentProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [draft, setDraft] = useState(postgres);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSave = draft.database.trim() && draft.user.trim() && draft.password;

  const handleConfirm = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await adminApi.updatePostgresSettings({
        database: draft.database.trim(), user: draft.user.trim(), password: draft.password,
      });
      setDraft(updated);
      onSaved(updated);
      setSaved(true);
      setConfirming(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('adminSettings.genericError'));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
        {t('adminSettings.postgres.description')}
      </Text>

      <TextInput
        mode="outlined"
        label={t('adminSettings.postgres.database')}
        value={draft.database}
        onChangeText={(v) => setDraft({ ...draft, database: v })}
        style={styles.field}
      />
      <TextInput
        mode="outlined"
        label={t('adminSettings.postgres.user')}
        value={draft.user}
        onChangeText={(v) => setDraft({ ...draft, user: v })}
        style={styles.field}
      />
      <TextInput
        mode="outlined"
        label={t('adminSettings.postgres.password')}
        value={draft.password}
        onChangeText={(v) => setDraft({ ...draft, password: v })}
        secureTextEntry
        style={styles.field}
      />

      {error && <Banner visible icon="alert-circle-outline" style={styles.banner}>{error}</Banner>}
      {saved && <Banner visible icon="check-circle-outline" style={styles.banner}>{t('adminSettings.saved')}</Banner>}

      <Button
        mode="contained"
        buttonColor={theme.colors.error}
        disabled={!canSave || saving}
        onPress={() => setConfirming(true)}
        style={styles.saveButton}
      >
        {saving ? <ActivityIndicator size={16} color={theme.colors.onError ?? '#fff'} /> : t('adminSettings.postgres.testAndSave')}
      </Button>

      <ConfirmDialog
        visible={confirming}
        title={t('adminSettings.postgres.confirmTitle')}
        message={t('adminSettings.postgres.confirmMessage')}
        confirmLabel={t('adminSettings.postgres.testAndSave')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={saving}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 8 },
  field: { marginBottom: 12 },
  banner: { marginBottom: 12 },
  saveButton: { alignSelf: 'flex-start', marginTop: 4 },
});
