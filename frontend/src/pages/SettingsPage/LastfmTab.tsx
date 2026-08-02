import { useState } from 'react';
import { Box, Typography, TextField, Button, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, LastfmSettings } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

interface LastfmTabProps {
  lastfm: LastfmSettings;
  onSaved: (lastfm: LastfmSettings) => void;
}

export function LastfmTab({ lastfm, onSaved }: LastfmTabProps) {
  const { t } = useTranslation();
  const { showSuccess } = useToast();
  const [draft, setDraft] = useState(lastfm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await adminApi.updateLastfmSettings(draft);
      setDraft(updated);
      onSaved(updated);
      showSuccess(t('settings.saved'));
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('settings.genericError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.lastfm.description')}</Typography>
      <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label={t('settings.lastfm.apiKey')}
          value={draft.apiKey ?? ''}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value || null })}
          fullWidth
        />
        <TextField
          label={t('settings.lastfm.apiSecret')}
          type="password"
          value={draft.apiSecret ?? ''}
          onChange={(e) => setDraft({ ...draft, apiSecret: e.target.value || null })}
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
          {t('settings.save')}
        </Button>
      </Box>
    </Box>
  );
}
