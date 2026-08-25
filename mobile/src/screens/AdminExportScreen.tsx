import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Switch, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { adminApi } from '../api/admin';

interface Result {
  type: 'success' | 'error';
  message: string;
}

// Mirrors web's ExportPage. There's no browser "Downloads" folder on
// mobile, so the CSV is written into the app's cache dir and handed to the
// OS share sheet (expo-sharing) instead — the user picks Files/AirDrop/
// email/whatever from there. See AdminImportScreen for the reverse trip.
export function AdminExportScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [onlyNonHq, setOnlyNonHq] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setResult(null);
    try {
      const { csv, filename } = await adminApi.exportTracks(onlyNonHq);

      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setResult({ type: 'error', message: t('export.sharingUnavailable') });
        return;
      }

      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: t('export.title') });
    } catch (err: any) {
      setResult({ type: 'error', message: err?.response?.data?.error ?? t('export.error') });
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
        {t('export.description')}
      </Text>

      <View style={styles.switchRow}>
        <Text variant="bodyLarge" style={{ flex: 1 }}>{t('export.onlyNonHq')}</Text>
        <Switch value={onlyNonHq} disabled={exporting} onValueChange={setOnlyNonHq} />
      </View>

      {result && (
        <Banner visible icon="alert-circle-outline" style={styles.banner}>
          {result.message}
        </Banner>
      )}

      <Button
        mode="contained"
        disabled={exporting}
        loading={exporting}
        onPress={handleExport}
        style={styles.button}
      >
        {t('export.button')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  banner: { marginBottom: 12 },
  button: { alignSelf: 'flex-start' },
});
