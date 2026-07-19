import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Tab,
  Tabs,
  Alert,
  CircularProgress,
} from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, register, resendVerification } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [checkEmailAddress, setCheckEmailAddress] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Sign-in fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate('/playlists');
    } catch (err: unknown) {
      const data = (err as any)?.response?.data;
      setError(data?.error ?? t('auth.signInFailed'));
      setNeedsVerification(data?.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regPassword !== regConfirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      const { email } = await register(regEmail, regPassword, regName);
      setCheckEmailAddress(email);
    } catch (err: unknown) {
      setError(
        (err as any)?.response?.data?.error ?? t('auth.registrationFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (email: string) => {
    setResendState('sending');
    try {
      await resendVerification(email);
    } finally {
      setResendState('sent');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420, p: 1 }}>
        <CardContent>
          {/* Branding */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 3,
            }}
          >
            <MusicNoteIcon sx={{ color: 'primary.main', fontSize: 36 }} />
            <Typography variant="h5" fontWeight={700} color="primary.main">
              {t('auth.appName')}
            </Typography>
          </Box>

          {checkEmailAddress ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'center' }}>
              <Typography variant="h6">{t('auth.checkYourEmailTitle')}</Typography>
              <Typography color="text.secondary">
                {t('auth.checkYourEmailBody', { email: checkEmailAddress })}
              </Typography>
              <Button
                variant="outlined"
                disabled={resendState === 'sending'}
                onClick={() => handleResend(checkEmailAddress)}
              >
                {resendState === 'sending'
                  ? <CircularProgress size={20} color="inherit" />
                  : t('auth.resendEmail')}
              </Button>
              {resendState === 'sent' && (
                <Alert severity="success">{t('auth.resendEmailSent')}</Alert>
              )}
              <Button
                variant="text"
                size="small"
                onClick={() => { setCheckEmailAddress(null); setResendState('idle'); setTab(0); }}
              >
                {t('auth.backToSignIn')}
              </Button>
            </Box>
          ) : (
          <>
          <Tabs
            value={tab}
            onChange={(_, v: number) => { setTab(v); setError(null); setNeedsVerification(false); }}
            variant="fullWidth"
            sx={{ mb: 3 }}
          >
            <Tab label={t('auth.signIn')} />
            <Tab label={t('auth.register')} />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
              {needsVerification && (
                <Button
                  size="small"
                  disabled={resendState === 'sending'}
                  onClick={() => handleResend(loginEmail)}
                  sx={{ display: 'block', mt: 1 }}
                >
                  {t('auth.resendEmail')}
                </Button>
              )}
            </Alert>
          )}

          {resendState === 'sent' && needsVerification && (
            <Alert severity="success" sx={{ mb: 2 }}>{t('auth.resendEmailSent')}</Alert>
          )}

          {/* Sign In */}
          {tab === 0 && (
            <Box
              component="form"
              onSubmit={handleLogin}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <TextField
                label={t('auth.email')}
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                fullWidth
                autoComplete="email"
                autoFocus
              />
              <TextField
                label={t('auth.password')}
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                fullWidth
                autoComplete="current-password"
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.signIn')}
              </Button>
              <Button
                variant="text"
                size="small"
                disabled={loading}
                onClick={() => { setLoginEmail('demo@gmail.com'); setLoginPassword('demo'); }}
              >
                {t('auth.useDemoAccount')}
              </Button>
            </Box>
          )}

          {/* Register */}
          {tab === 1 && (
            <Box
              component="form"
              onSubmit={handleRegister}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <TextField
                label={t('auth.displayName')}
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
                fullWidth
                autoComplete="name"
                autoFocus
              />
              <TextField
                label={t('auth.email')}
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
                fullWidth
                autoComplete="email"
              />
              <TextField
                label={t('auth.password')}
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                fullWidth
                autoComplete="new-password"
                helperText={t('auth.passwordHelper')}
              />
              <TextField
                label={t('auth.confirmPassword')}
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                required
                fullWidth
                autoComplete="new-password"
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.createAccount')}
              </Button>
            </Box>
          )}
          </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
