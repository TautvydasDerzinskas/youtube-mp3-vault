import { useState } from 'react';
import { Box, Typography, Button, Alert, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, HqSettings } from '../../api/admin';
import { useToast } from '../../contexts/ToastContext';

interface HqTabProps {
  hq: HqSettings;
  onSaved: (hq: HqSettings) => void;
}

export function HqTab({ hq, onSaved }: HqTabProps) {
  const { t } = useTranslation();
  const { showSuccess } = useToast();
  const [draft, setDraft] = useState(hq);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await adminApi.updateHqSettings(draft);
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
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.hq.description')}</Typography>
      <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControlLabel
          control={<Switch checked={draft.autoDownloadEnabled} onChange={(e) => setDraft({ ...draft, autoDownloadEnabled: e.target.checked })} />}
          label={t('settings.hq.autoDownloadEnabled')}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
          {t('settings.save')}
        </Button>
      </Box>
    </Box>
  );
}
