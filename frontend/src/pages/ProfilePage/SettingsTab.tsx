import { useState } from 'react';
import { Box, Typography, Switch, FormControlLabel } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

export function SettingsTab() {
  const { t } = useTranslation();
  const { user, setAutoDeleteNonMusic } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      await setAutoDeleteNonMusic(enabled);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
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
    </Box>
  );
}
