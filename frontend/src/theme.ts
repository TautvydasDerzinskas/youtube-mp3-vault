import { createTheme } from '@mui/material/styles';

// Headings use a purchased display font (self-hosted under the app's own
// name rather than the font's actual name — see fonts.css) at its Black
// weight — 'font-weight: 100 900' on that single face means any numeric
// weight a component requests still resolves to it, so an inline
// fontWeight={700}/{600} layered on a heading variant elsewhere in the app
// doesn't silently fall back to Inter for lacking an exact-matching face.
// Swap to 'YoutubeVault ExtraBold' (also self-hosted) for the other weight
// the font was purchased in.
const HEADING_FONT_FAMILY = '"YoutubeVault", "Inter", "Arial", sans-serif';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#db4515',
    },
    secondary: {
      main: '#9c27b0',
    },
    background: {
      default: '#ffffff',
      paper: '#f5f3f2',
    },
    text: {
      primary: '#000000',
      secondary: '#666362',
    },
    divider: '#c8c5c5',
  },
  typography: {
    fontFamily: '"Inter", "Arial", sans-serif',
    h1: { fontFamily: HEADING_FONT_FAMILY, fontWeight: 900 },
    h2: { fontFamily: HEADING_FONT_FAMILY, fontWeight: 900 },
    h3: { fontFamily: HEADING_FONT_FAMILY, fontWeight: 900 },
    h4: { fontFamily: HEADING_FONT_FAMILY, fontWeight: 900 },
    h5: { fontFamily: HEADING_FONT_FAMILY, fontWeight: 900 },
    h6: { fontFamily: HEADING_FONT_FAMILY, fontWeight: 900 },
  },
  components: {
    // Both reference the palette above via the styleOverrides callback form
    // (rather than repeating '#f5f3f2'/'#c8c5c5' as their own literals) so
    // that changing background.paper/divider in one place is enough — see
    // the sweep of every other component in this app onto the same
    // 'background.paper'/'divider' string tokens instead of hex literals.
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          borderRight: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
    MuiCard: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.background.paper,
          backgroundImage: 'none',
          border: `1px solid ${theme.palette.divider}`,
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
  },
});

export default theme;
