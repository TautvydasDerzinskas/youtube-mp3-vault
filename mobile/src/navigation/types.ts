import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  // NavigatorScreenParams (rather than plain `undefined`) lets callers
  // outside the tab navigator jump straight to a specific tab — e.g.
  // navigate('Tabs', { screen: 'Playlists' }) from BottomNav's "overlay"
  // mode, used on PlaylistDetail/TrackDetail/AllTracks (see RootNavigator)
  // to get back to the tab shell while keeping the bar itself visible there.
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Profile: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  UpdateServerUrl: undefined;
  AllSongs: undefined;
  AllArtists: undefined;
  AllGenres: undefined;
  PlaylistDetail: { playlistId: string };
  TrackDetail: { playlistId: string; trackId: string };
  // genreKey preselects a genre filter (see AllTracksScreen) — optional so
  // every existing navigate('AllTracks') call (no genre) keeps working.
  // genreLabel is just a display-string optimization: most call sites
  // already have a nicely-capitalized label at hand (DashboardGenre/
  // ArtistGenreCount both carry one) and passing it avoids re-deriving it
  // from the key; when absent (e.g. from a raw video.genres[] string),
  // AllTracksScreen falls back to formatGenre(genreKey).
  AllTracks: { genreKey?: string; genreLabel?: string } | undefined;
  ArtistDetail: { key: string };
  // Admin section — reached via an icon in Profile's header, shown only to
  // admin users (see RootNavigator). All pushed onto the same root stack as
  // Profile/ChangeEmail/etc. rather than their own nested navigator, since
  // there's no bottom-tab presence for any of these (mirrors how the web
  // admin pages are just more routes, not a separate app shell).
  Admin: undefined;
  AdminUsers: undefined;
  AdminUserDetail: { userId: string };
  AdminTriggers: undefined;
  AdminLogs: undefined;
  AdminSettings: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Playlists: undefined;
  Artists: undefined;
  Genres: undefined;
};

// Registers every route name — stack and tab alike — as react-navigation's
// default param list, so useNavigation()/navigate() calls anywhere in the
// app are typed without needing per-navigator generics or an `as never`
// cast at every call site. This is looser than strictly modeling which
// navigator owns which route, but navigate() bubbles from a nested
// navigator to its parent anyway (e.g. DashboardScreen, nested inside the
// tab navigator, already calls navigate('AllSongs') — a stack-level route —
// this way), and the app is small enough that the extra rigor of
// CompositeNavigationProp isn't worth it yet.
// See https://reactnavigation.org/docs/typescript/
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList, TabParamList {}
  }
}
