import { MD3DarkTheme } from 'react-native-paper';

export const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#ff0000',
    onPrimary: '#ffffff',
    secondary: '#9c27b0',
    onSecondary: '#ffffff',
    background: '#0f0f0f',
    onBackground: '#ffffff',
    surface: '#1a1a1a',
    onSurface: '#ffffff',
    surfaceVariant: '#1e1e1e',
    onSurfaceVariant: '#aaaaaa',
    outline: '#2a2a2a',
    outlineVariant: '#2a2a2a',
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: 'transparent',
      level1: '#1a1a1a',
      level2: '#1e1e1e',
      level3: '#232323',
      level4: '#262626',
      level5: '#2a2a2a',
    },
  },
};
