import { Box } from '@mui/material';
import { UserMenu } from './UserMenu';

// Desktop-only header strip above the routed page content — mobile's own
// AppBar (MobileTopBar.tsx) carries its own UserMenu instance instead.
export function TopBar() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 3, py: 1.5 }}>
      <UserMenu />
    </Box>
  );
}
