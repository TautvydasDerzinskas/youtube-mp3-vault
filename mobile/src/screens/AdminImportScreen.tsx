import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { adminApi, TrackImportSummary } from '../api/admin';

interface Result {
  type: 'success' | 'error';
  message: string;
}

// Mirrors web's ImportPage. expo-document-picker is used instead of a
// browser <input type="file"> — the picker's own mimeType filter is
// unreliable across devices/providers for .csv (some report
// text/comma-separated-values, some application/vnd.ms-excel, some just
// text/plain), so this allows any type and validates the extension itself,
// same as the web page does.
export function AdminImportScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [summary, setSummary] = useState<TrackImportSummary | null>(null);

  const handlePickFile = async () => {
    setResult(null);
    setSummary(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    if (!asset.name.toLowerCase().endsWith('.csv')) {
      setResult({ type: 'error', message: t('import.invalidFile') });
      return;
    }
    setFileName(asset.name);
    setFileUri(asset.uri);
  };

  const handleImport = async () => {
    if (!fileUri) return;
    setImporting(true);
    setResult(null);
    setSummary(null);
    try {
      const csv = await new File(fileUri).text();
      const importResult = await adminApi.importTracks(csv);
      setSummary(importResult);
    } catch (err: any) {
      setResult({ type: 'error', message: err?.response?.data?.error ?? t('import.error') });
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
        {t('import.description')}
      </Text>

      <View style={styles.fileRow}>
        <Button mode="outlined" onPress={handlePickFile} disabled={importing}>
          {t('import.chooseFile')}
        </Button>
        {fileName && <Text variant="bodyMedium" style={styles.fileName} numberOfLines={1}>{fileName}</Text>}
      </View>

      {result && (
        <Banner visible icon="alert-circle-outline" style={styles.banner}>
          {result.message}
        </Banner>
      )}

      <Button
        mode="contained"
        disabled={!fileUri || importing}
        loading={importing}
        onPress={handleImport}
        style={styles.button}
      >
        {t('import.button')}
      </Button>

      {summary && (
        <View style={styles.summary}>
          <Banner visible icon="check-circle-outline" style={styles.banner}>
            {t('import.summary.updated', { count: summary.updated })}
          </Banner>
          {summary.skipped > 0 && (
            <Banner visible icon="alert-circle-outline" style={styles.banner}>
              {t('import.summary.skipped', { count: summary.skipped })}
            </Banner>
          )}
          {summary.notFound.length > 0 && (
            <Banner visible icon="alert-circle-outline" style={styles.banner}>
              {t('import.summary.notFound', { count: summary.notFound.length, ids: summary.notFound.join(', ') })}
            </Banner>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  fileName: { flex: 1 },
  banner: { marginBottom: 12 },
  button: { alignSelf: 'flex-start', marginBottom: 4 },
  summary: { marginTop: 16 },
});
