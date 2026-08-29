import { createTheme, PaletteOptions } from '@mui/material/styles';

// A custom palette color (MUI only auto-augments its own built-in ones —
// primary/secondary/error/warning/info/success) for the HQ badge shown over
// a track's thumbnail once a higher-quality file has actually been
// downloaded (see TrackRow.tsx) — referenced as the token 'hq.main' rather
// than a hardcoded hex, same as every other color in this app.
declare module '@mui/material/styles' {
  interface Palette {
    hq: Palette['primary'];
  }
  interface PaletteOptions {
    hq?: PaletteOptions['primary'];
  }
}

// Headings use a purchased display font (self-hosted under the app's own
// name rather than the font's actual name — see fonts.css) at its Black
// weight — 'font-weight: 100 900' on that single face means any numeric
// weight a component requests still resolves to it, so an inline
// fontWeight={700}/{600} layered on a heading variant elsewhere in the app
// doesn't silently fall back to Inter for lacking an exact-matching face.
// Swap to 'YoutubeVault ExtraBold' (also self-hosted) for the other weight
// the font was purchased in.
const HEADING_FONT_FAMILY = '"YoutubeVault", "Inter", "Arial", sans-serif';

export type ThemeMode = 'light' | 'dark';

// Only the base palette differs between modes — accent (hq) and every
// component styleOverride below reads through palette tokens
// (background.paper/divider/etc.), so it stays correct in both modes for
// free rather than needing its own light/dark branch.
const PALETTES: Record<ThemeMode, PaletteOptions> = {
  light: {
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
  dark: {
    mode: 'dark',
    // The red/orange accent from light mode reads as an error/warning color
    // against black, so dark mode swaps it for gold instead.
    primary: {
      main: '#ffbf00',
    },
    secondary: {
      main: '#9c27b0',
    },
    background: {
      default: '#000000',
      paper: '#141414',
    },
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.55)',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },
};

export function getTheme(mode: ThemeMode) {
  const theme = createTheme({
    palette: PALETTES[mode],
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

  // augmentColor computes light/dark/contrastText the same way MUI's built-in
  // colors get them — custom palette keys don't go through that automatically,
  // so it's called explicitly here rather than hand-picking those shades.
  // Distinct per mode (unlike every other palette color, still shared) — the
  // bright yellow reads fine against light mode's white/near-white surfaces,
  // but a dark theme wants something that doesn't compete with the primary
  // accent, hence the navy blue instead. Every consumer reads hq.main/
  // hq.contrastText as tokens (never the literal hex), so this is the one
  // place that needs to know either color exists.
  theme.palette.hq = theme.palette.augmentColor({ color: { main: mode === 'dark' ? '#2d4886' : '#e7ff07' } });

  return theme;
}
