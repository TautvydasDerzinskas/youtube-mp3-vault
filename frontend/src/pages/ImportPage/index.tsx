import { useState } from 'react';
import { Box, Typography, Button, CircularProgress, Alert, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, TrackImportSummary } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

export default function ImportPage() {
  const { t } = useTranslation();
  const { showError } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<TrackImportSummary | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setSummary(null);
    if (selected && !selected.name.toLowerCase().endsWith('.csv')) {
      showError(t('import.invalidFile'));
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setSummary(null);
    try {
      const csv = await file.text();
      const result = await adminApi.importTracks(csv);
      setSummary(result);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('import.error'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      <Typography variant="h5" fontWeight={700} mb={1}>{t('import.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>{t('import.description')}</Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Button variant="outlined" component="label">
          {t('import.chooseFile')}
          <input type="file" accept=".csv,text/csv" hidden onChange={handleFileChange} />
        </Button>
        {file && <Chip label={file.name} onDelete={() => setFile(null)} />}
      </Box>

      <Button
        variant="contained"
        disabled={!file || importing}
        onClick={handleImport}
        sx={{ mb: 3 }}
      >
        {importing ? <CircularProgress size={20} color="inherit" /> : t('import.button')}
      </Button>

      {summary && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Alert severity="success">{t('import.summary.updated', { count: summary.updated })}</Alert>
          {summary.skipped > 0 && (
            <Alert severity="warning">{t('import.summary.skipped', { count: summary.skipped })}</Alert>
          )}
          {summary.notFound.length > 0 && (
            <Alert severity="warning">
              {t('import.summary.notFound', { count: summary.notFound.length, ids: summary.notFound.join(', ') })}
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
