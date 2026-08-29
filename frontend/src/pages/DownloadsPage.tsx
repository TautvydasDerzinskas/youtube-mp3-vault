import { Box, Typography, Button, Stack } from '@mui/material';
import { Android as AndroidIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { APK_URL } from '../constants';
import { usePageBack } from '../contexts/PageBackContext';

export default function DownloadsPage() {
  const { t } = useTranslation();
  usePageBack('/dashboard', t('common.backToDashboard'));

  return (
    <Box sx={{ p: 3, maxWidth: 480 }}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Typography variant="h5" fontWeight={700}>{t('downloads.title')}</Typography>
      </Stack>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2, py: 4 }}>
        <Button
          component="a"
          href={APK_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          size="large"
          startIcon={<AndroidIcon />}
          sx={{ px: 4, py: 1.5 }}
        >
          {t('downloads.downloadCta')}
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
          {t('downloads.description')}
        </Typography>
      </Box>
    </Box>
  );
}
