import { useState } from 'react';
import { Box, Typography, IconButton, Button } from '@mui/material';
import { Android as AndroidIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { APK_URL } from '../constants';

// Persisted (not just component state) so dismissing it sticks across page
// loads/navigations for that browser — it shouldn't nag on every visit.
const DISMISSED_KEY = 'mobileAppGateDismissed';

function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Full-screen, dismissible cover shown when the web app is opened from a
 * phone browser — the actual mobile experience only exists as the native
 * Android app, so this points there instead of letting someone use the
 * desktop-oriented web UI awkwardly on a small screen. Above every other
 * layer (sidebar/dialogs/snackbars) so it truly blocks the app until
 * dismissed, at which point the web app behaves completely normally.
 */
export function MobileAppGate() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');

  if (!isMobileBrowser() || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <Box
      sx={{
        position: 'fixed', inset: 0, zIndex: 2000,
        bgcolor: 'background.default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', p: 4, gap: 2,
      }}
    >
      <IconButton
        onClick={handleDismiss}
        aria-label={t('common.close')}
        sx={{ position: 'absolute', top: 16, right: 16 }}
      >
        <CloseIcon />
      </IconButton>

      <Button
        component="a"
        href={APK_URL}
        download
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, textTransform: 'none' }}
      >
        <AndroidIcon sx={{ fontSize: 96, color: 'primary.main' }} />
        <Typography variant="h6" color="text.primary">{t('mobileGate.downloadCta')}</Typography>
      </Button>

      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
        {t('mobileGate.description')}
      </Typography>

      <Button variant="text" onClick={handleDismiss} sx={{ mt: 2 }}>
        {t('mobileGate.continueOnWeb')}
      </Button>
    </Box>
  );
}
