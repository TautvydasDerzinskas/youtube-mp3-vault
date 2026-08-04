import { useState } from 'react';
import { Box, Typography, Switch, FormControlLabel, TextField, MenuItem, Divider, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, SupportedLanguage } from '../../i18n';

export function SettingsTab() {
  const { t } = useTranslation();
  const { user, updateLanguage, setAutoDeleteNonMusic, setNowPlayingPublic } = useAuth();
  const { showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [nowPlayingLoading, setNowPlayingLoading] = useState(false);

  const handleLanguageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      await updateLanguage(e.target.value as SupportedLanguage);
    } catch {
      showError(t('profile.genericError'));
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      await setAutoDeleteNonMusic(enabled);
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNowPlaying = async (enabled: boolean) => {
    setNowPlayingLoading(true);
    try {
      await setNowPlayingPublic(enabled);
    } catch {
      showError(t('profile.genericError'));
    } finally {
      setNowPlayingLoading(false);
    }
  };

  const nowPlayingUrl = user ? `${window.location.origin}/api/now-playing?email=${encodeURIComponent(user.email)}` : '';

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
            checked={user?.nowPlayingPublic ?? false}
            disabled={nowPlayingLoading}
            onChange={(e) => handleToggleNowPlaying(e.target.checked)}
          />
        }
        label={t('profile.settings.nowPlayingPublic.label')}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('profile.settings.nowPlayingPublic.description')}
      </Typography>

      {user?.nowPlayingPublic && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t('profile.settings.nowPlayingPublic.usage')}
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              mt: 1, p: 1.5, bgcolor: 'action.hover', overflowX: 'auto',
              fontFamily: 'monospace', fontSize: '0.8125rem', wordBreak: 'break-all',
            }}
          >
            {nowPlayingUrl}
          </Paper>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {t('profile.settings.nowPlayingPublic.exampleResponse')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
