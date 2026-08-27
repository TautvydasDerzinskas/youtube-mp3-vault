import client from './client';
import { tokenStorage } from '../auth/tokenStorage';

export interface Playlist {
  id: string;
  youtubeId: string | null;
  title: string;
  customName: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
  downloadedCount: number;
  failedCount: number;
  totalSize: number;
  totalDurationSec: number;
  syncStatus: 'idle' | 'syncing' | 'retrying' | 'generating' | 'error';
  syncPaused: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  currentVideo: { title: string; position: number } | null;
  isPacing: boolean;
  syncPhase: { phase: 'metadata' | 'quality'; current: number; total: number; title: string } | null;
  sourcePlaylistId: string | null;
  sourcePlaylistName: string | null;
  // Server-persisted mirror of the offline-download toggle (see
  // mobile/src/offline/OfflineDownloadsContext.tsx) — the downloaded files
  // themselves are always local-only, but this flag survives a reinstall/
  // new phone, letting the app restore which playlists to re-download.
  offlineEnabled: boolean;
}

// A Deezer/Qobuz/Tidal search result for a track's manual "Search for HQ"
// that didn't clear the backend's match-confidence bar — offered as a
// one-click rename suggestion (see CloseHqCandidatesSheet). Mirrors the
// backend's own CloseHqCandidate in slskdQualityWorker.ts.
export interface CloseHqCandidate {
  provider: 'slskd' | 'jiosaavn' | 'deezer' | 'qobuz' | 'tidal';
  artist: string;
  title: string;
}

export interface PlaylistVideo {
  id: string;
  youtubeId: string;
  title: string;
  // The raw YouTube title exactly as it was when this row was first created
  // — see schema.prisma's own doc comment. Used by the rename modal to show
  // what the video was actually titled on YouTube, alongside the (possibly
  // long since cleaned-up) `title` above.
  originalTitle: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  position: number;
  isAvailable: boolean;
  downloadStatus: 'pending' | 'downloading' | 'done' | 'failed' | 'removed';
  downloadError: string | null;
  fileSize: number | null;
  bitrate: number | null;
  addedAt: string;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  genres: string[];
  releaseYear: number | null;
  metadataStatus: 'pending' | 'found' | 'not_found' | 'error';
  playCount: number;
  lastPlayedAt: string | null;
  betterQualityExists: boolean;
  hqFileDownloaded: boolean;
  playlistId?: string;
}

// Shapes for GET /playlists/:id/manifest — see backend/src/routes/youtube.ts's
// MANIFEST_TRACK_SELECT/handler. Deliberately a separate (slimmer) type from
// PlaylistVideo/Playlist above rather than reusing them: the manifest is the
// one endpoint the offline-download feature (see mobile/src/offline/) polls
// repeatedly to diff against what's already on-device, so its shape is
// pinned to exactly what that diff needs (includes tracks regardless of
// isAvailable, unlike getVideos).
export interface ManifestTrack {
  id: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  genres: string[];
  releaseYear: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
  position: number;
  addedAt: string;
  downloadStatus: 'pending' | 'downloading' | 'done' | 'failed' | 'removed';
  mediaFileId: string | null;
  fileSize: number | null;
  bitrate: number | null;
  downloadUrl: string | null;
}

export interface PlaylistManifest {
  playlist: {
    id: string;
    title: string;
    customName: string | null;
    thumbnailUrl: string | null;
    videoCount: number;
    downloadedCount: number;
    failedCount: number;
    totalSize: number;
    lastSyncedAt: string | null;
  };
  tracks: ManifestTrack[];
}

// Mirrors backend/src/routes/youtube.ts's PlaySyncEntry — one queued play
// event, with the client's own record of when it actually happened
// (playedAt, unix ms) rather than relying on server "now" at sync time.
export interface PlaySyncEntry {
  playlistId: string;
  videoId: string;
  playedAt: number;
}

export interface RecommendedTrack {
  id: string;
  playlistId: string;
  youtubeId: string;
  title: string;
  artist: string | null;
  genres: string[];
  thumbnailUrl: string | null;
  duration: number | null;
  playCount: number;
  similarity: number;
}

// A YouTube search result, never downloaded — just a link out. See
// searchRemixes in backend/src/services/youtube.ts for the dedup logic.
export interface RemixResult {
  id: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

export interface DiscoverResult {
  artist: string;
  title: string;
  matchScore: number;
  youtubeId: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  spotifySearchUrl: string;
}

export interface UsedInPlaylist {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

// Mirrors frontend/src/api/youtube.ts's playlistsApi — same endpoints/shapes
// (see backend/src/routes/youtube.ts).
export const playlistsApi = {
  getAll: async (): Promise<{ playlists: Playlist[] }> => {
    const { data } = await client.get<{ playlists: Playlist[] }>('/playlists');
    return data;
  },

  getOne: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.get<{ playlist: Playlist }>(`/playlists/${id}`);
    return data;
  },

  // Every song across every playlist the user has — each row carries its
  // own playlistId, since (unlike getVideos) this doesn't belong to just one.
  getAllTracks: async (): Promise<{ videos: PlaylistVideo[]; songCount: number; totalDurationSec: number }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[]; songCount: number; totalDurationSec: number }>(
      '/playlists/all-tracks'
    );
    return data;
  },

  // Just the numbers the pinned "All Tracks" row at the bottom of the
  // playlists list needs — avoids pulling every video's full metadata just
  // to render that summary.
  getAllTracksSummary: async (): Promise<{ songCount: number; totalDurationSec: number; totalSize: number }> => {
    const { data } = await client.get<{ songCount: number; totalDurationSec: number; totalSize: number }>(
      '/playlists/all-tracks/summary'
    );
    return data;
  },

  add: async (url: string, customName?: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>('/playlists', {
      url,
      customName: customName || undefined,
    });
    return data;
  },

  rename: async (id: string, customName: string | null): Promise<{ playlist: Playlist }> => {
    const { data } = await client.patch<{ playlist: Playlist }>(`/playlists/${id}`, { customName });
    return data;
  },

  getVideos: async (id: string): Promise<{ videos: PlaylistVideo[] }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[] }>(`/playlists/${id}/videos`);
    return data;
  },

  // Only ever called from the offline-sync background flow (see
  // OfflineDownloadsContext) — a 404 there (playlist deleted while offline)
  // is already handled quietly, so it shouldn't also surface client.ts's
  // generic error toast.
  getManifest: async (id: string): Promise<PlaylistManifest> => {
    const { data } = await client.get<PlaylistManifest>(`/playlists/${id}/manifest`, { suppressErrorToast: true });
    return data;
  },

  getVideo: async (
    playlistId: string,
    videoId: string
  ): Promise<{ video: PlaylistVideo; searchingHq: boolean; closeHqCandidates: CloseHqCandidate[] }> => {
    const { data } = await client.get<{ video: PlaylistVideo; searchingHq: boolean; closeHqCandidates: CloseHqCandidate[] }>(
      `/playlists/${playlistId}/videos/${videoId}`
    );
    return data;
  },

  // Fire-and-forget — kicks off the same HQ provider search a playlist's
  // "Scan for HQ" runs for every video, for just this one. Poll getVideo's
  // searchingHq field to know when it's done — a non-empty closeHqCandidates
  // in that same response means the search found Deezer/Qobuz/Tidal results
  // that just didn't clear the match bar (see CloseHqCandidate's own doc
  // comment on the backend).
  searchTrackHq: async (playlistId: string, videoId: string): Promise<void> => {
    await client.post(`/playlists/${playlistId}/videos/${videoId}/search-hq`);
  },

  // Dismisses the current closeHqCandidates suggestion for this track
  // without acting on it, so a later poll/reload doesn't resurface it.
  dismissHqCandidates: async (playlistId: string, videoId: string): Promise<void> => {
    await client.post(`/playlists/${playlistId}/videos/${videoId}/dismiss-hq-candidates`);
  },

  // Instant, local best-guess artist/title for the rename modal's suggestion
  // box — not a live MusicBrainz lookup (see the backend route's own doc
  // comment for why).
  getSuggestedName: async (playlistId: string, videoId: string): Promise<{ artist: string | null; title: string }> => {
    const { data } = await client.get<{ artist: string | null; title: string }>(
      `/playlists/${playlistId}/videos/${videoId}/suggested-name`
    );
    return data;
  },

  // Fire-and-forget, same polling contract as searchTrackHq — see the
  // backend route's own doc comment for what runs after this (a fresh
  // MusicBrainz attempt and/or HQ search, whichever this track doesn't
  // already have).
  renameTrack: async (playlistId: string, videoId: string, artist: string | null, title: string): Promise<void> => {
    await client.post(`/playlists/${playlistId}/videos/${videoId}/rename`, { artist, title });
  },

  getRecommendations: async (playlistId: string, videoId: string): Promise<{ recommendations: RecommendedTrack[] }> => {
    const { data } = await client.get<{ recommendations: RecommendedTrack[] }>(
      `/playlists/${playlistId}/videos/${videoId}/recommendations`
    );
    return data;
  },

  getRemixes: async (playlistId: string, videoId: string): Promise<{ remixes: RemixResult[] }> => {
    const { data } = await client.get<{ remixes: RemixResult[] }>(`/playlists/${playlistId}/videos/${videoId}/remixes`);
    return data;
  },

  // `enabled` reflects the per-user Last.fm Discover flag (see AuthContext's
  // lastfmDiscoverAvailable) — the backend still gates this itself, this
  // isn't just a client-side check.
  getDiscover: async (playlistId: string, videoId: string): Promise<{ enabled: boolean; discover: DiscoverResult[] }> => {
    const { data } = await client.get<{ enabled: boolean; discover: DiscoverResult[] }>(
      `/playlists/${playlistId}/videos/${videoId}/discover`
    );
    return data;
  },

  getUsedIn: async (playlistId: string, videoId: string): Promise<{ usedIn: UsedInPlaylist[] }> => {
    const { data } = await client.get<{ usedIn: UsedInPlaylist[] }>(`/playlists/${playlistId}/videos/${videoId}/used-in`);
    return data;
  },

  // Permanently deletes the shared file and hides this track everywhere —
  // including other playlists (any user's) that happen to share the same
  // underlying YouTube video — see deleteTrackEverywhere in the backend's
  // syncService.ts for why that's unavoidable given the shared file store.
  deleteTrack: async (playlistId: string, videoId: string): Promise<void> => {
    await client.delete(`/playlists/${playlistId}/videos/${videoId}`);
  },

  // Persists the offline toggle server-side (Playlist.offlineEnabled) so a
  // reinstalled app / new phone can restore which playlists to re-download
  // (see OfflineDownloadsContext's startup reconciliation), and — enable
  // only — writes the admin-log entry. The actual downloaded files never
  // touch the server either way; these calls are fire-and-forget from the
  // caller, since the local enable/disable already took effect and a
  // failure here (including simply being offline right now) just means
  // this device's toggle state hasn't reached the server yet — the next
  // successful call catches it up, nothing to retry/queue in the meantime.
  enableOfflineOnServer: async (id: string): Promise<void> => {
    await client.post(`/playlists/${id}/enable-offline`, undefined, { suppressErrorToast: true });
  },

  disableOfflineOnServer: async (id: string): Promise<void> => {
    await client.post(`/playlists/${id}/disable-offline`, undefined, { suppressErrorToast: true });
  },

  // Bulk-reports plays via mobile/src/offline/playQueue.ts's queue rather
  // than a single-track played endpoint — every play (online or offline) goes
  // through the same queue+flush path, so playCount/lastPlayedAt and Last.fm
  // scrobbles carry the real playedAt instead of "whenever this request
  // happens to land" (see backend/src/routes/youtube.ts's plays/sync route).
  // Runs after every track finishes (and again on every reconnect/foreground
  // while anything's still queued) — a toast on each failed attempt would be
  // constant background noise, so errors here stay silent; the queue itself
  // (not this toast) is what guarantees nothing gets lost.
  syncPlays: async (plays: PlaySyncEntry[]): Promise<{ synced: number }> => {
    const { data } = await client.post<{ synced: number }>('/playlists/plays/sync', { plays }, { suppressErrorToast: true });
    return data;
  },

  sync: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/sync`);
    return data;
  },

  retryFailed: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/retry-failed`);
    return data;
  },

  scanHq: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/scan-hq`);
    return data;
  },

  pause: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/pause`);
    return data;
  },

  resume: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/resume`);
    return data;
  },

  remove: async (id: string): Promise<void> => {
    await client.delete(`/playlists/${id}`);
  },

  generateSimilar: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/generate-similar`);
    return data;
  },
};

// Unlike web (relative "/api/..." paths resolved against the page's own
// origin), mobile's client.defaults.baseURL is itself a full absolute URL
// the user configured (see ServerConfigContext) — so the stream URL has to
// be built as an absolute URL here rather than a bare path.
function streamUrl(playlistId: string, videoId: string): string {
  return `${client.defaults.baseURL}/playlists/${playlistId}/videos/${videoId}/stream`;
}

// expo-audio's AudioSource accepts { uri, headers } directly, and the
// backend's /stream route accepts a Bearer header as a fallback to its
// primary cookie-based auth (see backend/src/middleware/auth.ts extractToken)
// — so streaming can be authenticated the same way every other mobile API
// call already is, no signed-URL/query-param workaround needed.
export async function getStreamSource(playlistId: string, videoId: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await tokenStorage.get();
  return {
    uri: streamUrl(playlistId, videoId),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

// Same absolute-URL-plus-Bearer-header pattern as getStreamSource above, but
// for the permanent (non-range) /download route — this is what the offline
// downloader (mobile/src/offline/) fetches into a local/shared file. Built
// from playlistId/videoId directly rather than trusting ManifestTrack.downloadUrl
// as-is, since that path already includes a leading "/api" segment that
// would double up against client.defaults.baseURL (which itself ends in "/api").
export async function getDownloadSource(playlistId: string, videoId: string): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await tokenStorage.get();
  return {
    uri: `${client.defaults.baseURL}/playlists/${playlistId}/videos/${videoId}/download`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
