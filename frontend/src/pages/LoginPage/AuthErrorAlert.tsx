import { Fragment } from 'react';
import { Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface AuthErrorAlertProps {
  error: string | null;
  needsVerification: boolean;
  resendState: 'idle' | 'sending' | 'sent';
  onResend: () => void;
}

/** Sign-in/register error banner; grows a "resend verification" action when that's the specific failure. */
export function AuthErrorAlert({ error, needsVerification, resendState, onResend }: AuthErrorAlertProps) {
  const { t } = useTranslation();
  return (
    <Fragment>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          {needsVerification && (
            <Button size="small" disabled={resendState === 'sending'} onClick={onResend} sx={{ display: 'block', mt: 1 }}>
              {t('auth.resendEmail')}
            </Button>
          )}
        </Alert>
      )}
      {resendState === 'sent' && needsVerification && (
        <Alert severity="success" sx={{ mb: 2 }}>{t('auth.resendEmailSent')}</Alert>
      )}
    </Fragment>
  );
}
