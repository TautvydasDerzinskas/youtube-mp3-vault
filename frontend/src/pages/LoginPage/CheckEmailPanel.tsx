import { Box, Typography, Button, Alert, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface CheckEmailPanelProps {
  email: string;
  resendState: 'idle' | 'sending' | 'sent';
  onResend: () => void;
  onBackToSignIn: () => void;
}

/** Shown in place of the tabs/forms right after registration, until the user clicks the emailed link. */
export function CheckEmailPanel({ email, resendState, onResend, onBackToSignIn }: CheckEmailPanelProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
      <Typography variant="h6">{t('auth.checkYourEmailTitle')}</Typography>
      <Typography color="text.secondary">
        {t('auth.checkYourEmailBody', { email })}
      </Typography>
      <Button variant="outlined" disabled={resendState === 'sending'} onClick={onResend}>
        {resendState === 'sending' ? <CircularProgress size={20} color="inherit" /> : t('auth.resendEmail')}
      </Button>
      {resendState === 'sent' && (
        <Alert severity="success">{t('auth.resendEmailSent')}</Alert>
      )}
      <Button variant="text" size="small" onClick={onBackToSignIn}>
        {t('auth.backToSignIn')}
      </Button>
    </Box>
  );
}
