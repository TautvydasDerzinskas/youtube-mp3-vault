import { useState } from 'react';
import { Box, Typography, Button, TextField, Stack, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';

// Deezer is opt-in and per-user (unlike the Last.fm tab next to this one,
// there's no server-side "is this feature configured at all" flag to gate
// the tab on — every user can paste their own account's cookie regardless
// of server config, see services/deezer.ts/deezerReplace.ts).
export function DeezerTab() {
  const { t } = useTranslation();
  const { user, saveDeezerCookie, disconnectDeezer } = useAuth();
  const { showSuccess, showError } = useToast();
  const online = useOnlineStatus();
  const [cookieInput, setCookieInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSave = async () => {
    const trimmed = cookieInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveDeezerCookie(trimmed);
      setCookieInput('');
      showSuccess(t('profile.deezer.saved'));
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectDeezer();
      showSuccess(t('profile.deezer.disconnected'));
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Box>
      <Typography color="text.secondary" mb={2}>{t('profile.deezer.description')}</Typography>

      {user?.deezerConnected && (
        <Alert severity={user.deezerCookieValid === false ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {user.deezerCookieValid === false
            ? t('profile.deezer.connectedInvalid')
            : user.deezerCookieValid === true
              ? t('profile.deezer.connectedValid')
              : t('profile.deezer.connectedUnknown')}
        </Alert>
      )}

      <Stack gap={2} sx={{ alignItems: 'flex-start', maxWidth: 480 }}>
        <TextField
          label={t('profile.deezer.cookieLabel')}
          placeholder={t('profile.deezer.placeholder')}
          helperText={t('profile.deezer.cookieHelper')}
          value={cookieInput}
          onChange={(e) => setCookieInput(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
        <Button variant="contained" disabled={saving || !cookieInput.trim()} onClick={handleSave}>
          {t('profile.deezer.save')}
        </Button>

        {user?.deezerConnected && (
          <Button variant="outlined" color="error" disabled={disconnecting} onClick={handleDisconnect}>
            {t('profile.deezer.disconnect')}
          </Button>
        )}

        {!online && (
          <Typography variant="caption" color="text.secondary">
            {t('profile.deezer.offlineNotice')}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
