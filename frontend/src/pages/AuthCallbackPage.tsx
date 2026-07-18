import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    refreshUser()
      .then(() => navigate('/channels', { replace: true }))
      .catch(() => navigate('/login?error=auth_failed', { replace: true }));
  }, [refreshUser, navigate]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: 'background.default',
      }}
    >
      <CircularProgress color="primary" />
      <Typography color="text.secondary">{t('auth.completingSignIn')}</Typography>
    </Box>
  );
}
