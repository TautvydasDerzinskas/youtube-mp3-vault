import { useMediaQuery, useTheme } from '@mui/material';

// Single source of truth for the "small screen" breakpoint — AppLayout,
// MiniPlayer, and MobileTopBar all need to agree on when the permanent
// sidebar gives way to the mobile top bar.
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}
