import { useState } from 'react';
import { Box, Typography, Button, Alert, Switch, FormControlLabel, FormGroup, Checkbox } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { adminApi, HqSettings, HqUserProvider, HQ_USER_PROVIDERS } from '../../api/admin';
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

  const toggleProvider = (provider: HqUserProvider, enabled: boolean) => {
    setDraft({
      ...draft,
      allowedUserProviders: enabled
        ? [...draft.allowedUserProviders, provider]
        : draft.allowedUserProviders.filter((p) => p !== provider),
    });
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={2}>{t('settings.hq.description')}</Typography>
      <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControlLabel
          control={<Switch checked={draft.autoDownloadEnabled} onChange={(e) => setDraft({ ...draft, autoDownloadEnabled: e.target.checked })} />}
          label={t('settings.hq.autoDownloadEnabled')}
        />

        <Box>
          <Typography variant="subtitle2" mb={0.5}>{t('settings.hq.allowedUserProviders')}</Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>{t('settings.hq.allowedUserProvidersDescription')}</Typography>
          <FormGroup>
            {HQ_USER_PROVIDERS.map((provider) => (
              <FormControlLabel
                key={provider}
                control={
                  <Checkbox
                    checked={draft.allowedUserProviders.includes(provider)}
                    onChange={(e) => toggleProvider(provider, e.target.checked)}
                  />
                }
                label={t(`settings.hq.provider.${provider}`)}
              />
            ))}
          </FormGroup>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
          {t('settings.save')}
        </Button>
      </Box>
    </Box>
  );
}
