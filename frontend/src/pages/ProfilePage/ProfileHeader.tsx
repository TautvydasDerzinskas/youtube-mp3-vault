import { Stack, Typography, IconButton, Tooltip, Button } from '@mui/material';
import { ArrowBack as ArrowBackIcon, Logout as LogoutIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProfileHeaderProps {
  title: string;
  onBack: () => void;
}

export function ProfileHeader({ title, onBack }: ProfileHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Stack direction="row" alignItems="center" gap={1} mb={3}>
      <Tooltip title={t('profile.back')}>
        <IconButton onClick={onBack} sx={{ ml: -1 }}>
          <ArrowBackIcon />
        </IconButton>
      </Tooltip>
      <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>{title}</Typography>
      <Button variant="outlined" color="error" size="small" startIcon={<LogoutIcon />} onClick={handleLogout}>
        {t('profile.logout')}
      </Button>
    </Stack>
  );
}
