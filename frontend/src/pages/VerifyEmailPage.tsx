import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert, Link } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError(t('auth.verifyEmailFailed'));
      return;
    }
    verifyEmail(token)
      .then(() => navigate('/playlists', { replace: true }))
      .catch((err: unknown) => {
        setError((err as any)?.response?.data?.error ?? t('auth.verifyEmailFailed'));
      });
  }, [searchParams, verifyEmail, navigate, t]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 2,
        backgroundColor: 'background.default',
      }}
    >
      {error ? (
        <>
          <Alert severity="error">{error}</Alert>
          <Link component={RouterLink} to="/login">{t('auth.backToSignIn')}</Link>
        </>
      ) : (
        <>
          <CircularProgress color="primary" />
          <Typography color="text.secondary">{t('auth.verifyingEmail')}</Typography>
        </>
      )}
    </Box>
  );
}
