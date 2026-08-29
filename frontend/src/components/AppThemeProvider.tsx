import { ReactNode, useMemo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getTheme, ThemeMode } from '../theme';

// Reads the theme mode from the authenticated user's own DB-persisted
// preference (see AuthContext's updateTheme/UserMenu's Theme submenu) rather
// than localStorage, so it follows the account across devices. Defaults to
// light before the user loads and for logged-out visitors.
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const mode: ThemeMode = user?.themeMode === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => getTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
