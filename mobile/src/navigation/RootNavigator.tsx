import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { theme } from '../theme';
import { PlayerProvider } from '../contexts/PlayerContext';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { GenresScreen } from '../screens/GenresScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { RootStackParamList } from './types';

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
const Stack = createNativeStackNavigator<RootStackParamList>();

// TopBar + the 4-tab shell — a plain View wrapper (not a Tab.Screen option)
// since TopBar must stay mounted across tab switches and isn't itself a
// route. Registered as the root stack's "Tabs" screen below.
function AppShell() {
  return (
    <View style={{ flex: 1 }}>
      <TopBar />
      <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <BottomNav {...props} />}>
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Playlists" component={PlaylistsScreen} />
        <Tab.Screen name="Artists" component={ArtistsScreen} />
        <Tab.Screen name="Genres" component={GenresScreen} />
      </Tab.Navigator>
    </View>
  );
}

// The authenticated app shell — mounted once a user is signed in (see
// App.tsx's AuthGate). Profile lives on this outer stack (not as a 5th
// tab) since it's reached only via TopBar's avatar, mirroring web's
// sidebar-avatar-click pattern rather than being a primary nav section.
export function RootNavigator() {
  return (
    <PlayerProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator>
          <Stack.Screen name="Tabs" component={AppShell} options={{ headerShown: false }} />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              title: 'Profile',
              headerStyle: { backgroundColor: theme.colors.elevation.level2 },
              headerTintColor: theme.colors.onBackground,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PlayerProvider>
  );
}
