import { useState } from 'react';
import { Box, Typography, TextField, Button, Alert, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, PostgresSettings } from '../../api/admin';

interface PostgresTabProps {
  postgres: PostgresSettings;
  onSaved: (postgres: PostgresSettings) => void;
}

export function PostgresTab({ postgres, onSaved }: PostgresTabProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(postgres);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!draft.database.trim() || !draft.user.trim() || !draft.password) {
      setError(t('settings.postgres.required'));
      return;
    }
    setSaving(true);
    try {
      const updated = await adminApi.updatePostgresSettings(draft);
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
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.postgres.description')}</Typography>
      <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField label={t('settings.postgres.database')} value={draft.database} onChange={(e) => setDraft({ ...draft, database: e.target.value })} required fullWidth />
        <TextField label={t('settings.postgres.user')} value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} required fullWidth />
        <TextField label={t('settings.postgres.password')} type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} required fullWidth />
        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">{t('settings.saved')}</Alert>}
        <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
          {saving ? <CircularProgress size={20} color="inherit" /> : t('settings.postgres.testAndSave')}
        </Button>
      </Box>
    </Box>
  );
}
