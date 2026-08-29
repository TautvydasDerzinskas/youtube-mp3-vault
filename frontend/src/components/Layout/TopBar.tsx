import { Box } from '@mui/material';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';

// Desktop-only header strip above the routed page content — mobile's own
// AppBar (MobileTopBar.tsx) carries its own UserMenu/NotificationBell instead.
export function TopBar() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, px: 3, py: 1.5 }}>
      <NotificationBell />
      <UserMenu />
    </Box>
  );
}
