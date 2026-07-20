import { useEffect, useState } from 'react';
import {
  Box, Typography, TextField, Button, Alert, Divider, Stack,
  Switch, FormControlLabel, CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, SmtpSettings, PostgresSettings } from '../../api/admin';

const EMPTY_SMTP: SmtpSettings = { host: null, port: 587, secure: false, user: null, pass: null, from: '' };
const EMPTY_POSTGRES: PostgresSettings = { database: '', user: '', password: '' };

export default function SettingsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [smtp, setSmtp] = useState<SmtpSettings>(EMPTY_SMTP);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const [smtpSaved, setSmtpSaved] = useState(false);

  const [postgres, setPostgres] = useState<PostgresSettings>(EMPTY_POSTGRES);
  const [postgresSaving, setPostgresSaving] = useState(false);
  const [postgresError, setPostgresError] = useState<string | null>(null);
  const [postgresSaved, setPostgresSaved] = useState(false);

  useEffect(() => {
    adminApi.getSettings()
      .then(({ smtp, postgres }) => { setSmtp(smtp); setPostgres(postgres); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpError(null);
    setSmtpSaved(false);
    setSmtpSaving(true);
    try {
      setSmtp(await adminApi.updateSmtpSettings(smtp));
      setSmtpSaved(true);
    } catch (err: any) {
      setSmtpError(err.response?.data?.error ?? t('settings.genericError'));
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSavePostgres = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostgresError(null);
    setPostgresSaved(false);
    if (!postgres.database.trim() || !postgres.user.trim() || !postgres.password) {
      setPostgresError(t('settings.postgres.required'));
      return;
    }
    setPostgresSaving(true);
    try {
      setPostgres(await adminApi.updatePostgresSettings(postgres));
      setPostgresSaved(true);
    } catch (err: any) {
      setPostgresError(err.response?.data?.error ?? t('settings.genericError'));
    } finally {
      setPostgresSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (loadError) {
    return <Alert severity="error" sx={{ m: 3 }}>{t('settings.failedToLoad')}</Alert>;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 560 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>{t('settings.title')}</Typography>

      <Typography variant="subtitle1" fontWeight={600} mb={1}>{t('settings.smtp.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.smtp.description')}</Typography>
      <Box component="form" onSubmit={handleSaveSmtp} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        <TextField
          label={t('settings.smtp.host')}
          value={smtp.host ?? ''}
          onChange={(e) => setSmtp({ ...smtp, host: e.target.value || null })}
          placeholder="smtp.example.com"
          fullWidth
        />
        <Stack direction="row" gap={2}>
          <TextField
            label={t('settings.smtp.port')}
            type="number"
            value={smtp.port}
            onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) || 587 })}
            sx={{ flex: 1 }}
          />
          <FormControlLabel
            sx={{ flex: 1, ml: 0 }}
            control={<Switch checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />}
            label={t('settings.smtp.secure')}
          />
        </Stack>
        <TextField label={t('settings.smtp.user')} value={smtp.user ?? ''} onChange={(e) => setSmtp({ ...smtp, user: e.target.value || null })} fullWidth />
        <TextField label={t('settings.smtp.pass')} type="password" value={smtp.pass ?? ''} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value || null })} fullWidth />
        <TextField label={t('settings.smtp.from')} value={smtp.from} onChange={(e) => setSmtp({ ...smtp, from: e.target.value })} fullWidth />
        {smtpError && <Alert severity="error">{smtpError}</Alert>}
        {smtpSaved && <Alert severity="success">{t('settings.saved')}</Alert>}
        <Button type="submit" variant="contained" disabled={smtpSaving} sx={{ alignSelf: 'flex-start' }}>
          {t('settings.save')}
        </Button>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} mb={1}>{t('settings.postgres.title')}</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.postgres.description')}</Typography>
      <Box component="form" onSubmit={handleSavePostgres} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField label={t('settings.postgres.database')} value={postgres.database} onChange={(e) => setPostgres({ ...postgres, database: e.target.value })} required fullWidth />
        <TextField label={t('settings.postgres.user')} value={postgres.user} onChange={(e) => setPostgres({ ...postgres, user: e.target.value })} required fullWidth />
        <TextField label={t('settings.postgres.password')} type="password" value={postgres.password} onChange={(e) => setPostgres({ ...postgres, password: e.target.value })} required fullWidth />
        {postgresError && <Alert severity="error">{postgresError}</Alert>}
        {postgresSaved && <Alert severity="success">{t('settings.saved')}</Alert>}
        <Button type="submit" variant="contained" disabled={postgresSaving} sx={{ alignSelf: 'flex-start' }}>
          {postgresSaving ? <CircularProgress size={20} color="inherit" /> : t('settings.postgres.testAndSave')}
        </Button>
      </Box>
    </Box>
  );
}
