import { useState } from 'react';
import { Box, Typography, Button, TextField, Stack, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';

// Qobuz is opt-in and per-user, same as the Deezer tab next to this one —
// every user connects their own account regardless of server config (see
// services/qobuz.ts/qobuzReplace.ts). Unlike Deezer, Qobuz has no
// browser-copyable session cookie a user could hand us instead, so this is
// a real email/password login form rather than a cookie paste; the password
// itself is only ever used server-side to obtain a session, see
// services/qobuz.ts's establishQobuzSession.
export function QobuzTab() {
  const { t } = useTranslation();
  const { user, saveQobuzCredentials, disconnectQobuz } = useAuth();
  const { showSuccess, showError } = useToast();
  const online = useOnlineStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSave = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    setSaving(true);
    try {
      await saveQobuzCredentials(trimmedEmail, password);
      setEmail('');
      setPassword('');
      showSuccess(t('profile.qobuz.saved'));
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectQobuz();
      showSuccess(t('profile.qobuz.disconnected'));
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Box>
      <Typography color="text.secondary" mb={2}>{t('profile.qobuz.description')}</Typography>

      {user?.qobuzConnected && (
        <Alert severity={user.qobuzCredentialsValid === false ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {user.qobuzCredentialsValid === false
            ? t('profile.qobuz.connectedInvalid')
            : user.qobuzCredentialsValid === true
              ? t('profile.qobuz.connectedValid')
              : t('profile.qobuz.connectedUnknown')}
        </Alert>
      )}

      <Stack gap={2} sx={{ alignItems: 'flex-start', maxWidth: 480 }}>
        <TextField
          label={t('profile.qobuz.emailLabel')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
        />
        <TextField
          label={t('profile.qobuz.passwordLabel')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
        />
        <Button variant="contained" disabled={saving || !email.trim() || !password} onClick={handleSave}>
          {t('profile.qobuz.save')}
        </Button>

        {user?.qobuzConnected && (
          <Button variant="outlined" color="error" disabled={disconnecting} onClick={handleDisconnect}>
            {t('profile.qobuz.disconnect')}
          </Button>
        )}

        {!online && (
          <Typography variant="caption" color="text.secondary">
            {t('profile.qobuz.offlineNotice')}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
