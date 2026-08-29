import { Box, Button, IconButton, Tooltip } from '@mui/material';
import { Add as AddIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { usePageBackContext } from '../../contexts/PageBackContext';

// Desktop-only header strip above the routed page content — mobile's own
// AppBar (MobileTopBar.tsx) carries its own UserMenu/NotificationBell/Import
// instead. The back arrow (when the current page has registered one via
// usePageBack) sits at the left edge of this same right-aligned button
// group, replacing what used to be a full row each page spent on its own
// inline back button.
export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { backTarget } = usePageBackContext();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, px: 3, py: 1.5 }}>
      {backTarget && (
        <Tooltip title={backTarget.label}>
          <IconButton size="small" onClick={() => navigate(backTarget.path)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
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
