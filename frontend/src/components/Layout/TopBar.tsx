import { Box, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';

// Desktop-only header strip above the routed page content — mobile's own
// AppBar (MobileTopBar.tsx) carries its own UserMenu/NotificationBell/Import
// instead.
export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, px: 3, py: 1.5 }}>
      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={() => navigate('/playlists?add=1')}
      >
        {t('playlists.importButton')}
      </Button>
      <NotificationBell />
      <UserMenu />
    </Box>
  );
}
