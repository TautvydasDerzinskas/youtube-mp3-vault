import { useEffect, useState } from 'react';
import { Box, Typography, Alert, CircularProgress, Tabs, Tab } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, SmtpSettings, PostgresSettings, LastfmSettings, HqSettings } from '../../api/admin';
import { SmtpTab } from './SmtpTab';
import { LastfmTab } from './LastfmTab';
import { HqTab } from './HqTab';
import { PostgresTab } from './PostgresTab';

const EMPTY_SMTP: SmtpSettings = { host: null, port: 587, secure: false, user: null, pass: null, from: '' };
const EMPTY_POSTGRES: PostgresSettings = { database: '', user: '', password: '' };
const EMPTY_LASTFM: LastfmSettings = { apiKey: null, apiSecret: null };
const EMPTY_HQ: HqSettings = { autoDownloadEnabled: false, allowedUserProviders: [] };

export default function SettingsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [smtp, setSmtp] = useState<SmtpSettings>(EMPTY_SMTP);
  const [postgres, setPostgres] = useState<PostgresSettings>(EMPTY_POSTGRES);
  const [lastfm, setLastfm] = useState<LastfmSettings>(EMPTY_LASTFM);
  const [hq, setHq] = useState<HqSettings>(EMPTY_HQ);

  useEffect(() => {
    adminApi.getSettings()
      .then(({ smtp, postgres, lastfm, hq }) => {
        setSmtp(smtp); setPostgres(postgres); setLastfm(lastfm); setHq(hq);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (loadError) {
    return <Alert severity="error" sx={{ m: 3 }}>{t('settings.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>{t('settings.title')}</Typography>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="fullWidth" sx={{ mb: 3 }}>
        <Tab label={t('settings.smtp.title')} />
        <Tab label={t('settings.lastfm.title')} />
        <Tab label={t('settings.hq.title')} />
        <Tab label={t('settings.postgres.title')} />
      </Tabs>

      {tab === 0 && <SmtpTab smtp={smtp} onSaved={setSmtp} />}
      {tab === 1 && <LastfmTab lastfm={lastfm} onSaved={setLastfm} />}
      {tab === 2 && <HqTab hq={hq} onSaved={setHq} />}
      {tab === 3 && <PostgresTab postgres={postgres} onSaved={setPostgres} />}
    </Box>
  );
}
