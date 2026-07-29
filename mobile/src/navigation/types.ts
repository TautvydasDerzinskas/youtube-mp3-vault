export type RootStackParamList = {
  Tabs: undefined;
  Profile: undefined;
  AllSongs: undefined;
  AllArtists: undefined;
  AllGenres: undefined;
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
