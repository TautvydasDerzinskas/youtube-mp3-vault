import { Box, Typography } from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export function Branding() {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
      <MusicNoteIcon sx={{ color: 'primary.main', fontSize: 36 }} />
      <Typography variant="h5" fontWeight={700} color="primary.main">
        {t('auth.appName')}
      </Typography>
    </Box>
  );
}
