// Param list for the small nested stack AppShell swaps in when the server
// is unreachable (see RootNavigator.tsx) — deliberately not merged into
// RootStackParamList/TabParamList (types.ts): these two routes only exist
// inside that isolated offline-mode stack and are never reachable via the
// app's normal navigate() calls, so they don't need to participate in the
// global ReactNavigation.RootParamList typing.
export type OfflineStackParamList = {
  OfflinePlaylists: undefined;
  OfflinePlaylistDetail: { playlistId: string };
  // Offline counterpart of the root stack's AllTracks — every downloaded
  // track across every offline-synced playlist, flattened (see
  // OfflineAllTracksScreen). Kept in this isolated stack rather than on
  // RootStackParamList for the same reason as the other two routes here.
  OfflineAllTracks: undefined;
};
