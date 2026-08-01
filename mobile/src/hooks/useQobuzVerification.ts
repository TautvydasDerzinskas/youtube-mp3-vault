import { useEffect, useRef, useState } from 'react';
import { hqApi } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

// Mirrors web's QobuzVerificationPrompt polling — see backend's
// services/qobuz/session.ts for why this exists: Qobuz HQ discovery's
// one-time verification is a real Cloudflare Turnstile challenge that only a
// real human in a real browser can complete, so an opted-in user
// (user.qobuzHqEnabled) is occasionally asked to open it. Only polls at all
// for users who opted in.
const POLL_INTERVAL_MS = 30_000;
const SNOOZE_MS = 10 * 60 * 1000;

export function useQobuzVerification(): { challengeUrl: string | null; snooze: () => void } {
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

  const snooze = () => {
    snoozedUntilRef.current = Date.now() + SNOOZE_MS;
    setChallengeUrl(null);
  };

  return { challengeUrl, snooze };
}
