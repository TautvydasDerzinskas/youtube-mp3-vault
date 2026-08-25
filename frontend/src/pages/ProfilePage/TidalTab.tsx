import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, Stack, Alert, CircularProgress, Link } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';
import { TidalStartResponse } from '../../api/auth';

// Tidal is opt-in and per-user, same as the Deezer/Qobuz tabs next to this
// one — every user connects their own account regardless of server config
// (see services/tidal.ts/tidalReplace.ts). Unlike either of those, Tidal has
// neither a browser-copyable session cookie nor a real password login this
// app can use directly — connecting is the device-code flow Tidal's own
// TV/games-console apps use: the user opens a short link and types in a code
// this component shows them, and this tab polls the backend until that
// finishes (see AuthContext's startTidalAuth/pollTidalAuth).
export function TidalTab() {
  const { t } = useTranslation();
  const { user, startTidalAuth, pollTidalAuth, disconnectTidal } = useAuth();
  const { showSuccess, showError } = useToast();
  const online = useOnlineStatus();
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState<TidalStartResponse | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      try {
        const result = await pollTidalAuth();
        if (result.status === 'connected') {
          clearInterval(id);
          setPending(null);
          showSuccess(t('profile.tidal.saved'));
        } else if (result.status === 'expired') {
          clearInterval(id);
          setPending(null);
          showError(t('profile.tidal.expired'));
        } else if (result.status === 'error') {
          clearInterval(id);
          setPending(null);
          showError(t('profile.genericError'));
        }
        // 'pending' — user hasn't finished on tidal.com yet, keep polling.
      } catch {
        // A single network hiccup shouldn't abort the whole flow — just try
        // again on the next tick.
      }
    }, pending.intervalSec * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.userCode]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const auth = await startTidalAuth();
      setPending(auth);
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setStarting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectTidal();
      setPending(null);
      showSuccess(t('profile.tidal.disconnected'));
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Box>
      <Typography color="text.secondary" mb={2}>{t('profile.tidal.description')}</Typography>

      {user?.tidalConnected && !pending && (
        <Alert severity={user.tidalCredentialsValid === false ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {user.tidalCredentialsValid === false
            ? t('profile.tidal.connectedInvalid')
            : user.tidalCredentialsValid === true
              ? t('profile.tidal.connectedValid')
              : t('profile.tidal.connectedUnknown')}
        </Alert>
      )}

      <Stack gap={2} sx={{ alignItems: 'flex-start', maxWidth: 480 }}>
        {pending ? (
          <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ width: '100%' }}>
            <Typography variant="body2" mb={1}>{t('profile.tidal.waitingInstructions')}</Typography>
            <Typography variant="h5" component="p" sx={{ fontFamily: 'monospace', letterSpacing: 2 }}>
              {pending.userCode}
            </Typography>
            <Link href={`https://${pending.verificationUri}`} target="_blank" rel="noopener noreferrer">
              {pending.verificationUri}
            </Link>
          </Alert>
        ) : (
          <Button variant="contained" disabled={starting || !online} onClick={handleStart}>
            {user?.tidalConnected ? t('profile.tidal.reconnect') : t('profile.tidal.connect')}
          </Button>
        )}

        {user?.tidalConnected && !pending && (
          <Button variant="outlined" color="error" disabled={disconnecting} onClick={handleDisconnect}>
            {t('profile.tidal.disconnect')}
          </Button>
        )}

        {!online && (
          <Typography variant="caption" color="text.secondary">
            {t('profile.tidal.offlineNotice')}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
