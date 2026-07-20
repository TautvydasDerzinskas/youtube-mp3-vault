import { Box, Typography, TextField, MenuItem, Avatar, Stack, Button, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, SupportedLanguage } from '../../i18n';
import { useGravatarUrl } from '../../hooks/useGravatarUrl';

export function ProfileTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateLanguage } = useAuth();
  const avatarUrl = useGravatarUrl(user?.email, 128);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateLanguage(e.target.value as SupportedLanguage);
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={2} mb={3}>
        <Avatar src={avatarUrl} alt={t('profile.avatarAlt')} sx={{ width: 64, height: 64 }}>
          {user?.displayName?.[0]?.toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>{user?.displayName}</Typography>
          <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
        </Box>
      </Stack>

      <TextField label={t('profile.displayName')} value={user?.displayName ?? ''} disabled fullWidth
        helperText={t('profile.displayNameHelper')} sx={{ mb: 3 }} />

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

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="body1">{user?.email}</Typography>
          {user?.pendingEmail && (
            <Typography variant="caption" color="text.secondary">
              {t('profile.pendingEmailShort', { email: user.pendingEmail })}
            </Typography>
          )}
        </Box>
        <Button variant="text" onClick={() => navigate('/profile/email')}>
          {t('profile.changeEmailLink')}
        </Button>
      </Stack>

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="body1">{'••••••••'}</Typography>
        <Button variant="text" onClick={() => navigate('/profile/password')}>
          {t('profile.changePasswordLink')}
        </Button>
      </Stack>
    </Box>
  );
}
