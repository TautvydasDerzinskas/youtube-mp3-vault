import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DarkTheme, NavigationContainer, Theme, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { PlayerProvider } from '../contexts/PlayerContext';
import { OfflineDownloadsProvider } from '../offline/OfflineDownloadsContext';
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
import { ArtistDetailScreen } from '../screens/ArtistDetailScreen';
import { OfflinePlaylistsScreen } from '../screens/OfflinePlaylistsScreen';
import { OfflinePlaylistDetailScreen } from '../screens/OfflinePlaylistDetailScreen';
import { OfflineAllTracksScreen } from '../screens/OfflineAllTracksScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { AdminUsersScreen } from '../screens/AdminUsersScreen';
import { AdminUserDetailScreen } from '../screens/AdminUserDetailScreen';
import { AdminTriggersScreen } from '../screens/AdminTriggersScreen';
import { AdminLogsScreen } from '../screens/AdminLogsScreen';
import { AdminSettingsScreen } from '../screens/AdminSettingsScreen';
import { useServerReachability } from '../hooks/useServerReachability';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { RootStackParamList, TabParamList } from './types';
import { OfflineStackParamList } from './offlineTypes';

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
const OfflineStack = createNativeStackNavigator<OfflineStackParamList>();

// TopBar + the 4-tab shell — a plain View wrapper (not a Tab.Screen option)
// since TopBar must stay mounted across tab switches and isn't itself a
// route. Registered as the root stack's "Tabs" screen below.
//
// When the configured server can't be reached (useServerReachability),
// the normal tab content is swapped for a small nested stack of
// offline-only screens (OfflinePlaylists/OfflinePlaylistDetail/
// OfflineAllTracks — see offlineTypes.ts), TopBar is hidden (its content —
// search, avatar, sync status — is all online-only), and each of those
// screens renders its own BottomNav in `disabled` mode via
// OfflineScreenWithBottomNav below (mirroring ScreenWithBottomNav's own
// per-screen bar for the online root-stack screens) — tabs are visible but
// grayed out/inert, while the middle play/pause button and the drag-reveal
// MiniPlayer keep working, since playback of already-downloaded tracks
// doesn't depend on the server at all. Nesting the bar inside the stack
// (rather than as a fixed sibling of OfflineStack.Navigator) is what lets
// its middle button reach OfflineAllTracks — a route that only exists
// inside this isolated stack, unreachable from outside it.
function AppShell({ isReachable }: { isReachable: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      {isReachable && <TopBar />}
      {isReachable ? (
        <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <BottomNav {...props} />}>
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Playlists" component={PlaylistsScreen} />
          <Tab.Screen name="Artists" component={ArtistsScreen} />
          <Tab.Screen name="Genres" component={GenresScreen} />
        </Tab.Navigator>
      ) : (
        <OfflineStack.Navigator screenOptions={{ headerShown: false }}>
          <OfflineStack.Screen name="OfflinePlaylists">
            {() => <OfflineScreenWithBottomNav><OfflinePlaylistsScreen /></OfflineScreenWithBottomNav>}
          </OfflineStack.Screen>
          <OfflineStack.Screen name="OfflinePlaylistDetail">
            {() => <OfflineScreenWithBottomNav><OfflinePlaylistDetailScreen /></OfflineScreenWithBottomNav>}
          </OfflineStack.Screen>
          <OfflineStack.Screen name="OfflineAllTracks">
            {() => <OfflineScreenWithBottomNav><OfflineAllTracksScreen /></OfflineScreenWithBottomNav>}
          </OfflineStack.Screen>
        </OfflineStack.Navigator>
      )}
    </View>
  );
}

// Offline-stack counterpart to ScreenWithBottomNav below — same reasoning,
// just for OfflineStack.Navigator's screens instead of the root stack's.
function OfflineScreenWithBottomNav({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      <BottomNav mode="disabled" />
    </View>
  );
}

// Wraps a root-stack screen with a persistent BottomNav in `overlay` mode —
// used only for PlaylistDetail/TrackDetail/AllTracks (see Stack.Navigator
// below), which live outside the Tab.Navigator and so would otherwise lose
// both the bar and the MiniPlayer nested inside it (BottomNav is the only
// place MiniPlayer renders) the moment a user opens one. `activeRouteName`
// is fixed per screen rather than derived from navigation history, since all
// three are playlist/track content regardless of which tab they were opened
// from — tapping a tab here jumps back to "Tabs" and focuses that tab.
function ScreenWithBottomNav({ activeRouteName, children }: { activeRouteName: keyof TabParamList; children: ReactNode }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={{ flex: 1 }}>
      {children}
      <BottomNav
        mode="overlay"
        activeRouteName={activeRouteName}
        onTabPress={(routeName) => navigation.navigate('Tabs', { screen: routeName as keyof TabParamList })}
      />
    </View>
  );
}

// Shown in Profile's header, right side, only for admin accounts — the sole
// entry point into the admin section (Users/Triggers/Logs/Settings, all
// pushed onto this same root stack — see Admin* screens below). A plain
// function can't call useAuth() itself, so this has to be its own component
// rather than an inline options.headerRight callback.
function ProfileHeaderRight() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  if (!user?.isAdmin) return null;
  return (
    <Pressable onPress={() => navigation.navigate('Admin')} hitSlop={8}>
      <MaterialCommunityIcons name="shield-account-outline" size={24} color={theme.colors.onBackground} />
    </Pressable>
  );
}

// The authenticated app shell — mounted once a user is signed in (see
// App.tsx's AuthGate). Profile and the dashboard "see more" screens all
// live on this outer stack (not as tabs) since they're each reached from
// somewhere other than the bottom nav — Profile via TopBar's avatar,
// AllSongs/AllArtists/AllGenres via DashboardScreen's "see more" buttons.
export function RootNavigator() {
  const { t } = useTranslation();
  // Hoisted here (rather than read separately by AppShell and
  // OfflineDownloadsProvider) so both act on the exact same reachability
  // signal instead of each running its own independent /health poll — see
  // OfflineDownloadsProvider's isReachable prop for why it needs this too
  // (gates the startup orphan-cleanup/reconciliation effect).
  const isReachable = useServerReachability();

  return (
    <OfflineDownloadsProvider isReachable={isReachable}>
      <PlayerProvider>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.elevation.level2 },
              headerTintColor: theme.colors.onBackground,
            }}
          >
            <Stack.Screen name="Tabs" options={{ headerShown: false }}>
              {() => <AppShell isReachable={isReachable} />}
            </Stack.Screen>
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: t('profile.title'), headerRight: () => <ProfileHeaderRight /> }}
            />
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
            <Stack.Screen name="PlaylistDetail" options={{ title: t('nav.playlists') }}>
              {() => <ScreenWithBottomNav activeRouteName="Playlists"><PlaylistDetailScreen /></ScreenWithBottomNav>}
            </Stack.Screen>
            <Stack.Screen name="TrackDetail" options={{ title: '' }}>
              {() => <ScreenWithBottomNav activeRouteName="Playlists"><TrackDetailScreen /></ScreenWithBottomNav>}
            </Stack.Screen>
            <Stack.Screen name="AllTracks" options={{ title: t('playlists.allTracks.title') }}>
              {() => <ScreenWithBottomNav activeRouteName="Playlists"><AllTracksScreen /></ScreenWithBottomNav>}
            </Stack.Screen>
            <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} options={{ title: t('nav.artists') }} />
            <Stack.Screen name="Admin" component={AdminScreen} options={{ title: t('admin.title') }} />
            <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: t('users.title') }} />
            <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} options={{ title: t('users.detailsTitle') }} />
            <Stack.Screen name="AdminTriggers" component={AdminTriggersScreen} options={{ title: t('triggers.title') }} />
            <Stack.Screen name="AdminLogs" component={AdminLogsScreen} options={{ title: t('logs.title') }} />
            <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} options={{ title: t('adminSettings.title') }} />
          </Stack.Navigator>
        </NavigationContainer>
      </PlayerProvider>
    </OfflineDownloadsProvider>
  );
}
