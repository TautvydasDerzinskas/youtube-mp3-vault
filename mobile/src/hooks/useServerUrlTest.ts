import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { isCompleteServerUrl, normalizeServerUrl } from '../config';

// Shared by ServerSetupScreen (first-run) and UpdateServerUrlScreen (in-app
// "change server URL" setting) — a candidate address must pass this
// /health check before it's ever saved, so a typo can't silently strand
// the app pointed at a server that doesn't exist.
export function useServerUrlTest() {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const test = useCallback(async (rawUrl: string): Promise<string | null> => {
    setError(null);
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setError(t('serverSetup.enterAddress'));
      return null;
    }
    if (!isCompleteServerUrl(trimmed)) {
      setError(t('serverSetup.invalidUrl'));
      return null;
    }

    const normalized = normalizeServerUrl(trimmed);
    setTesting(true);
    try {
      const { data } = await axios.get(`${normalized}/health`, { timeout: 8000 });
      if (data?.status !== 'ok') throw new Error('unexpected health response');
      return normalized;
    } catch (err: any) {
      const status = err?.response?.status;
      setError(status ? t('serverSetup.serverError', { status }) : t('serverSetup.unreachable'));
      return null;
    } finally {
      setTesting(false);
    }
  }, [t]);

  return { testing, error, setError, test };
}
