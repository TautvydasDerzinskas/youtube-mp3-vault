import { useState } from 'react';
import { Box, Typography, FormControlLabel, Switch, Button, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageBackContext';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function ExportPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  usePageTitle(t('export.title'));
  const { showError } = useToast();
  const [onlyNonHq, setOnlyNonHq] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await adminApi.exportTracks(onlyNonHq);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      showError(t('export.error'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      {isMobile && <Typography variant="h5" fontWeight={700} mb={1}>{t('export.title')}</Typography>}
      <Typography variant="body2" color="text.secondary" mb={3}>{t('export.description')}</Typography>

      <FormControlLabel
        control={<Switch checked={onlyNonHq} onChange={(e) => setOnlyNonHq(e.target.checked)} />}
        label={t('export.onlyNonHq')}
        sx={{ mb: 2, display: 'flex' }}
      />

      <Box>
        <Button
          variant="contained"
          disabled={exporting}
          onClick={handleExport}
          sx={{ alignSelf: 'flex-start' }}
        >
          {exporting ? <CircularProgress size={20} color="inherit" /> : t('export.button')}
        </Button>
      </Box>
    </Box>
  );
}
