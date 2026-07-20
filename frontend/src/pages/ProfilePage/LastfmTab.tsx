import { useState } from 'react';
import { Box, Typography, Button, Alert, Stack, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/auth';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';

interface LastfmTabProps {
  result: string | null;
}

export function LastfmTab({ result }: LastfmTabProps) {
  const { t } = useTranslation();
  const { user, disconnectLastfm, setScrobbling } = useAuth();
  const online = useOnlineStatus();
  const [scrobblingLoading, setScrobblingLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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

  return (
    <Box>
      {result === 'connected' && <Alert severity="success" sx={{ mb: 2 }}>{t('profile.lastfm.connectedAlert')}</Alert>}
      {result === 'error' && <Alert severity="error" sx={{ mb: 2 }}>{t('profile.lastfm.errorAlert')}</Alert>}

      {user?.lastfmUsername ? (
        <Stack gap={2} sx={{ alignItems: 'flex-start' }}>
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
          <Button variant="outlined" color="error" disabled={disconnecting} onClick={handleDisconnectLastfm}>
            {t('profile.lastfm.disconnect')}
          </Button>
        </Stack>
      ) : (
        <Box>
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
    </Box>
  );
}
