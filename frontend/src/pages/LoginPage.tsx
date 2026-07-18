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
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate('/playlists');
    } catch (err: unknown) {
      setError(
        (err as any)?.response?.data?.error ?? t('auth.signInFailed')
      );
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
      await register(regEmail, regPassword, regName);
      navigate('/playlists');
    } catch (err: unknown) {
      setError(
        (err as any)?.response?.data?.error ?? t('auth.registrationFailed')
      );
    } finally {
      setLoading(false);
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

          <Tabs
            value={tab}
            onChange={(_, v: number) => { setTab(v); setError(null); }}
            variant="fullWidth"
            sx={{ mb: 3 }}
          >
            <Tab label={t('auth.signIn')} />
            <Tab label={t('auth.register')} />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
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
        </CardContent>
      </Card>
    </Box>
  );
}
