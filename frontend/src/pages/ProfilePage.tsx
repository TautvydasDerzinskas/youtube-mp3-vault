import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Alert, MenuItem,
  Divider, Stack, IconButton, Tooltip, Switch, FormControlLabel,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Logout as LogoutIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, SupportedLanguage } from '../i18n';
import { useOnlineStatus } from './PlaylistsPage/hooks/useOnlineStatus';

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    user, updateLanguage, updateProfile, logout,
    lastfmScrobblingAvailable, disconnectLastfm, setScrobbling,
  } = useAuth();
  const online = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const lastfmResult = searchParams.get('lastfm');
  const [scrobblingLoading, setScrobblingLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (lastfmResult) setSearchParams({}, { replace: true });
  }, []);

  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleToggleScrobbling = async (enabled: boolean) => {
    setScrobblingLoading(true);
    try {
      await setScrobbling(enabled);
    } finally {
      setScrobblingLoading(false);
    }
  };

  const handleDisconnectLastfm = async () => {
    setDisconnecting(true);
    try {
      await disconnectLastfm();
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateLanguage(e.target.value as SupportedLanguage);
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailLoading(true);
    try {
      await updateProfile({ currentPassword: emailPassword, email: email.trim() });
      setEmailPassword('');
    } catch (err: any) {
      setEmailError(err.response?.data?.error ?? t('profile.genericError'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setPasswordLoading(true);
    try {
      await updateProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess(true);
    } catch (err: any) {
      setPasswordError(err.response?.data?.error ?? t('profile.genericError'));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 480 }}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Tooltip title={t('profile.back')}>
          <IconButton onClick={() => navigate('/playlists')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" fontWeight={700}>{t('profile.title')}</Typography>
      </Stack>

      <TextField label={t('profile.displayName')} value={user?.displayName ?? ''} disabled fullWidth
        helperText={t('profile.displayNameHelper')} sx={{ mb: 3 }} />

      <TextField
        select
        label={t('profile.language')}
        value={user?.language ?? 'en'}
        onChange={handleLanguageChange}
        fullWidth
        sx={{ mb: 4 }}
      >
        {SUPPORTED_LANGUAGES.map(code => (
          <MenuItem key={code} value={code}>{LANGUAGE_LABELS[code]}</MenuItem>
        ))}
      </TextField>

      <Divider sx={{ mb: 3 }} />

      <Box component="form" onSubmit={handleSaveEmail} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        {user?.pendingEmail && (
          <Alert severity="info">
            {t('profile.pendingEmailNotice', { email: user.pendingEmail })}
          </Alert>
        )}
        <TextField label={t('profile.email')} type="email" value={email}
          onChange={e => setEmail(e.target.value)} required fullWidth />
        <TextField label={t('profile.currentPassword')} type="password" value={emailPassword}
          onChange={e => setEmailPassword(e.target.value)} required fullWidth />
        {emailError && <Alert severity="error">{emailError}</Alert>}
        <Button type="submit" variant="contained" disabled={emailLoading} sx={{ alignSelf: 'flex-start' }}>
          {t('profile.saveEmail')}
        </Button>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('profile.changePassword')}</Typography>
      <Box component="form" onSubmit={handleSavePassword} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        <TextField label={t('profile.currentPassword')} type="password" value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)} required fullWidth />
        <TextField label={t('profile.newPassword')} type="password" value={newPassword}
          onChange={e => setNewPassword(e.target.value)} required fullWidth helperText={t('auth.passwordHelper')} />
        <TextField label={t('profile.confirmNewPassword')} type="password" value={confirmNewPassword}
          onChange={e => setConfirmNewPassword(e.target.value)} required fullWidth />
        {passwordError && <Alert severity="error">{passwordError}</Alert>}
        {passwordSuccess && <Alert severity="success">{t('profile.passwordUpdated')}</Alert>}
        <Button type="submit" variant="contained" disabled={passwordLoading} sx={{ alignSelf: 'flex-start' }}>
          {t('profile.savePassword')}
        </Button>
      </Box>

      {lastfmScrobblingAvailable && (
        <>
          <Divider sx={{ mb: 3 }} />

          <Typography variant="subtitle1" fontWeight={600} mb={1}>{t('profile.lastfm.title')}</Typography>

          {lastfmResult === 'connected' && <Alert severity="success" sx={{ mb: 2 }}>{t('profile.lastfm.connectedAlert')}</Alert>}
          {lastfmResult === 'error' && <Alert severity="error" sx={{ mb: 2 }}>{t('profile.lastfm.errorAlert')}</Alert>}

          {user?.lastfmUsername ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
              <Typography color="text.secondary">
                {t('profile.lastfm.connectedAs', { username: user.lastfmUsername })}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={user.scrobblingEnabled}
                    disabled={scrobblingLoading}
                    onChange={(e) => handleToggleScrobbling(e.target.checked)}
                  />
                }
                label={t('profile.lastfm.enableScrobbling')}
              />
              <Button variant="outlined" color="error" disabled={disconnecting} onClick={handleDisconnectLastfm} sx={{ alignSelf: 'flex-start' }}>
                {t('profile.lastfm.disconnect')}
              </Button>
            </Box>
          ) : (
            <Box sx={{ mb: 4 }}>
              <Typography color="text.secondary" mb={2}>{t('profile.lastfm.description')}</Typography>
              {online ? (
                <Button component="a" href={authApi.lastfmConnectUrl} variant="contained">
                  {t('profile.lastfm.connect')}
                </Button>
              ) : (
                <>
                  <Button variant="contained" disabled sx={{ mb: 1 }}>
                    {t('profile.lastfm.connect')}
                  </Button>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {t('profile.lastfm.offlineNotice')}
                  </Typography>
                </>
              )}
            </Box>
          )}
        </>
      )}

      <Divider sx={{ mb: 3 }} />

      <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>
        {t('profile.logout')}
      </Button>
    </Box>
  );
}
