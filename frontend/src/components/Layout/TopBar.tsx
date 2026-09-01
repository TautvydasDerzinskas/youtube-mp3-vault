import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { usePageBackContext } from '../../contexts/PageBackContext';

// Desktop-only header strip above the routed page content — mobile's own
// AppBar (MobileTopBar.tsx) carries its own UserMenu/NotificationBell/Import
// instead. The back arrow (when the current page has registered one via
// usePageBack) sits at the true left edge of the bar, followed by the page
// title (via usePageTitle) when the page has one — replacing what used to
// be a full row each page spent on its own inline heading — opposite the
// Import/Bell/UserMenu cluster.
export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { backTarget, pageTitle, pageActions } = usePageBackContext();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, px: 3, py: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        {backTarget && (
          <Tooltip title={backTarget.label}>
            <IconButton size="small" onClick={() => navigate(backTarget.path)}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {pageTitle && (
          <Typography variant="h6" fontWeight={700} noWrap>{pageTitle}</Typography>
        )}
        {pageActions}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
    </Box>
  );
}
