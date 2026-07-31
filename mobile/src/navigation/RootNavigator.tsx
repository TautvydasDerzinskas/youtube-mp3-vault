import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { PlayerProvider } from '../contexts/PlayerContext';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { ArtistsScreen } from '../screens/ArtistsScreen';
import { GenresScreen } from '../screens/GenresScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ChangeEmailScreen } from '../screens/ChangeEmailScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { UpdateServerUrlScreen } from '../screens/UpdateServerUrlScreen';
import { AllSongsScreen } from '../screens/AllSongsScreen';
import { AllArtistsScreen } from '../screens/AllArtistsScreen';
import { AllGenresScreen } from '../screens/AllGenresScreen';
import { PlaylistDetailScreen } from '../screens/PlaylistDetailScreen';
import { TrackDetailScreen } from '../screens/TrackDetailScreen';
import { AllTracksScreen } from '../screens/AllTracksScreen';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { RootStackParamList, TabParamList } from './types';

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

const Tab = createBottomTabNavigator<TabParamList>();
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
// App.tsx's AuthGate). Profile and the dashboard "see more" screens all
// live on this outer stack (not as tabs) since they're each reached from
// somewhere other than the bottom nav — Profile via TopBar's avatar,
// AllSongs/AllArtists/AllGenres via DashboardScreen's "see more" buttons.
export function RootNavigator() {
  const { t } = useTranslation();

  return (
    <PlayerProvider>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.elevation.level2 },
            headerTintColor: theme.colors.onBackground,
          }}
        >
          <Stack.Screen name="Tabs" component={AppShell} options={{ headerShown: false }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('profile.title') }} />
          <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} options={{ title: t('profile.changeEmailTitle') }} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: t('profile.changePassword') }} />
          <Stack.Screen name="UpdateServerUrl" component={UpdateServerUrlScreen} options={{ title: t('profile.settings.serverUrl.label') }} />
          <Stack.Screen name="AllSongs" component={AllSongsScreen} options={{ title: t('dashboard.songsOnRepeat.title') }} />
          <Stack.Screen name="AllArtists" component={AllArtistsScreen} options={{ title: t('dashboard.topArtists.title') }} />
          <Stack.Screen name="AllGenres" component={AllGenresScreen} options={{ title: t('dashboard.topGenres.title') }} />
          {/* Both set their own header title dynamically via
              navigation.setOptions once their data loads (see each
              screen) — a playlist/track name isn't known at this level,
              only the id passed as a route param. */}
          <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} options={{ title: t('nav.playlists') }} />
          <Stack.Screen name="TrackDetail" component={TrackDetailScreen} options={{ title: '' }} />
          <Stack.Screen name="AllTracks" component={AllTracksScreen} options={{ title: t('playlists.allTracks.title') }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PlayerProvider>
  );
}
