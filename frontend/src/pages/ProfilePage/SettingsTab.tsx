import { useState } from 'react';
import { Box, Typography, Switch, FormControlLabel, TextField, MenuItem, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, SupportedLanguage } from '../../i18n';

export function SettingsTab() {
  const { t } = useTranslation();
  const { user, updateLanguage, setAutoDeleteNonMusic, setQobuzHqEnabled } = useAuth();
  const [loading, setLoading] = useState(false);
  const [qobuzLoading, setQobuzLoading] = useState(false);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateLanguage(e.target.value as SupportedLanguage);
  };

  const handleToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      await setAutoDeleteNonMusic(enabled);
    } finally {
      setLoading(false);
    }
  };

  const handleQobuzToggle = async (enabled: boolean) => {
    setQobuzLoading(true);
    try {
      await setQobuzHqEnabled(enabled);
    } finally {
      setQobuzLoading(false);
    }
  };

  return (
    <Box>
      <TextField
        select
        label={t('profile.language')}
        value={user?.language ?? 'en'}
        onChange={handleLanguageChange}
        fullWidth
        sx={{ mb: 3 }}
      >
        {SUPPORTED_LANGUAGES.map(code => (
          <MenuItem key={code} value={code}>{LANGUAGE_LABELS[code]}</MenuItem>
        ))}
      </TextField>

      <Divider sx={{ mb: 2 }} />

      <FormControlLabel
        control={
          <Switch
            checked={user?.autoDeleteNonMusicEnabled ?? false}
            disabled={loading}
            onChange={(e) => handleToggle(e.target.checked)}
          />
        }
        label={t('profile.settings.autoDeleteNonMusic.label')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('profile.settings.autoDeleteNonMusic.description')}
      </Typography>

      <Divider sx={{ my: 2 }} />

      <FormControlLabel
        control={
          <Switch
            checked={user?.qobuzHqEnabled ?? false}
            disabled={qobuzLoading}
            onChange={(e) => handleQobuzToggle(e.target.checked)}
          />
        }
        label={t('profile.settings.qobuzHq.label')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('profile.settings.qobuzHq.description')}
      </Typography>
    </Box>
  );
}
