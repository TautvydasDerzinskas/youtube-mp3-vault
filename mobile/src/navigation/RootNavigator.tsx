import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { theme } from '../theme';
import { PlayerProvider } from '../contexts/PlayerContext';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { GenresScreen } from '../screens/GenresScreen';
import { BottomNav } from './BottomNav';

// Keeps screen-transition backgrounds/borders consistent with the app's own
// theme.ts (react-native-paper) instead of react-navigation's own default
// palette — avoids a light-theme flash during navigation.
const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.elevation.level2,
    text: theme.colors.onBackground,
    border: theme.colors.outline,
  },
};

const Tab = createBottomTabNavigator();

// The authenticated app shell — mounted once a user is signed in (see
// App.tsx's AuthGate). Tab.Navigator only supplies routing/focus state here;
// all actual rendering of the bar (including the non-route middle
// play/pause button) is delegated to BottomNav.
export function RootNavigator() {
  return (
    <PlayerProvider>
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <BottomNav {...props} />}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Playlists" component={PlaylistsScreen} />
          <Tab.Screen name="Artists" component={ArtistsScreen} />
          <Tab.Screen name="Genres" component={GenresScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </PlayerProvider>
  );
}
