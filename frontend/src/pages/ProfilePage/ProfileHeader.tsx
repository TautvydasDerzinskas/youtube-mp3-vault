import { Stack, Typography, Button } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../hooks/useLogout';
import { usePageBack } from '../../contexts/PageBackContext';

interface ProfileHeaderProps {
  title: string;
  // Distinct per caller — ProfilePage itself goes back to the dashboard,
  // but ChangeEmailPage/ChangePasswordPage (also using this same header) go
  // back to the Profile page instead.
  backPath: string;
  backLabel: string;
}

export function ProfileHeader({ title, backPath, backLabel }: ProfileHeaderProps) {
  const { t } = useTranslation();
  const handleLogout = useLogout();
  usePageBack(backPath, backLabel);

  return (
    <Stack direction="row" alignItems="center" gap={1} mb={3}>
      <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>{title}</Typography>
      <Button variant="outlined" color="error" size="small" startIcon={<LogoutIcon />} onClick={handleLogout}>
        {t('profile.logout')}
      </Button>
    </Stack>
  );
}
