import { useState } from 'react';
import { Box, Typography, TextField, Button, Alert, Stack, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, SmtpSettings } from '../../api/admin';

interface SmtpTabProps {
  smtp: SmtpSettings;
  onSaved: (smtp: SmtpSettings) => void;
}

export function SmtpTab({ smtp, onSaved }: SmtpTabProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(smtp);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await adminApi.updateSmtpSettings(draft);
      setDraft(updated);
      onSaved(updated);
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('settings.genericError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.smtp.description')}</Typography>
      <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label={t('settings.smtp.host')}
          value={draft.host ?? ''}
          onChange={(e) => setDraft({ ...draft, host: e.target.value || null })}
          placeholder="smtp.example.com"
          fullWidth
        />
        <Stack direction="row" gap={2}>
          <TextField
            label={t('settings.smtp.port')}
            type="number"
            value={draft.port}
            onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 587 })}
            sx={{ flex: 1 }}
          />
          <FormControlLabel
            sx={{ flex: 1, ml: 0 }}
            control={<Switch checked={draft.secure} onChange={(e) => setDraft({ ...draft, secure: e.target.checked })} />}
            label={t('settings.smtp.secure')}
          />
        </Stack>
        <TextField label={t('settings.smtp.user')} value={draft.user ?? ''} onChange={(e) => setDraft({ ...draft, user: e.target.value || null })} fullWidth />
        <TextField label={t('settings.smtp.pass')} type="password" value={draft.pass ?? ''} onChange={(e) => setDraft({ ...draft, pass: e.target.value || null })} fullWidth />
        <TextField label={t('settings.smtp.from')} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} fullWidth />
        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">{t('settings.saved')}</Alert>}
        <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
          {t('settings.save')}
        </Button>
      </Box>
    </Box>
  );
}
