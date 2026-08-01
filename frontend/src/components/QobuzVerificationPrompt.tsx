import { useEffect, useRef, useState } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { hqApi } from '../api/auth';

// Polls for a pending Qobuz HQ verification challenge and, when one exists,
// offers to open it in a popup — the real Cloudflare Turnstile challenge can
// only be completed by a real human in a real browser (see backend's
// services/qobuz/session.ts), so this is that human's entry point. Only
// polls at all for users who opted into Qobuz HQ discovery (see SettingsTab)
// — nobody else is ever asked to do this.
const POLL_INTERVAL_MS = 30_000;
const SNOOZE_MS = 10 * 60 * 1000;

export function QobuzVerificationPrompt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challengeUrl, setChallengeUrl] = useState<string | null>(null);
  const snoozedUntilRef = useRef(0);

  useEffect(() => {
    if (!user?.qobuzHqEnabled) {
      setChallengeUrl(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      if (Date.now() < snoozedUntilRef.current) return;
      try {
        const status = await hqApi.getQobuzVerificationStatus();
        if (cancelled) return;
        setChallengeUrl(status.needed ? status.challengeUrl : null);
      } catch {
        // Best-effort — a failed poll just tries again next interval.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.qobuzHqEnabled]);

  const isSnoozed = Date.now() < snoozedUntilRef.current;
  if (!challengeUrl || isSnoozed) return null;

  const handleVerify = () => {
    window.open(challengeUrl, 'qobuz-verify', 'width=480,height=640,noopener=no');
    snoozedUntilRef.current = Date.now() + SNOOZE_MS;
    setChallengeUrl(null);
  };

  const handleDismiss = () => {
    snoozedUntilRef.current = Date.now() + SNOOZE_MS;
    setChallengeUrl(null);
  };

  return (
    <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert
        severity="info"
        action={
          <>
            <Button color="inherit" size="small" onClick={handleVerify}>
              {t('qobuzVerification.verify')}
            </Button>
            <Button color="inherit" size="small" onClick={handleDismiss}>
              {t('qobuzVerification.dismiss')}
            </Button>
          </>
        }
      >
        {t('qobuzVerification.message')}
      </Alert>
    </Snackbar>
  );
}
