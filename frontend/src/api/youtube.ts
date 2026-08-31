import client from './client';

export interface SyncPhase {
  phase: 'metadata' | 'quality';
  current: number;
  total: number;
  title: string;
  // Ids of every video with a real, terminal verdict so far this pass,
  // oldest-first (processing order) — see backend/src/services/syncService.ts's
  // SyncPhase for why this can't just be derived from qualityCheckStatus/
  // metadataStatus (those persist across passes, so under a "Scan for HQ"
  // rescan an already-`checked` row would look done before this pass ever
  // reaches it).
  processedIds: string[];
  // Subset of processedIds (quality phase only) that got a genuinely new HQ
  // upgrade this pass.
  hqFoundIds: string[];
}

export interface Playlist {
  id: string;
  // Null only for a generated ("similar playlist") entry — see sourcePlaylistId.
  youtubeId: string | null;
  title: string;
  customName: string | null;
  thumbnailUrl: string | null;
  videoCount: number;
  downloadedCount: number;
  failedCount: number;
  totalSize: number;
  // Sum of `duration` across downloaded videos only — how much you can
  // actually listen to right now, not the nominal length of everything
  // nominally in the playlist.
  totalDurationSec: number;
  syncStatus: 'idle' | 'syncing' | 'retrying' | 'generating' | 'scanning_hq' | 'error';
  syncPaused: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  currentVideo: { title: string; position: number } | null;
  // True while the backend is deliberately sitting in a pacing delay between
  // downloads (see downloadPendingVideos in syncService.ts) — during this
  // window currentVideo is null (nothing is actually downloading), so this
  // is what backs the "Pacing…" message shown in that same slot.
  isPacing: boolean;
  // Set once every video is downloaded but the sync pass is still working
  // through metadata resolution / HQ quality-checking — both can take a
  // while (real network searches, and with the HQ auto-download toggle on,
  // real file transfers), so this is what backs a distinct "still working"
  // message and progress bar instead of the download progress bar just
  // sitting at 100% with nothing to distinguish "working" from "stuck".
  syncPhase: SyncPhase | null;
  // Set only on a generated playlist — the source it was generated from
  // (sourcePlaylistName is a snapshot, so it survives the source being
  // renamed or deleted later).
  sourcePlaylistId: string | null;
  sourcePlaylistName: string | null;
}

// A Deezer/Qobuz/Tidal search result for a track's manual "Search for HQ"
// that didn't clear the backend's match-confidence bar — offered as a
// one-click rename suggestion (see CloseHqCandidatesDialog). Mirrors the
// backend's own CloseHqCandidate in slskdQualityWorker.ts.
export interface CloseHqCandidate {
  provider: 'slskd' | 'deezer' | 'qobuz' | 'tidal';
  artist: string;
  title: string;
  durationSec: number | null;
  // A 30-second preview clip to play inline before committing to a rename —
  // only ever set for a Deezer candidate right now (see DeezerSearchResult's
  // own doc comment on the backend for why the other providers don't have
  // one available this cheaply).
  previewUrl: string | null;
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
  // Set the instant playback starts, unlike lastPlayedAt above (finish-only)
  // — backs Listening History's ordering. See getHistory/markPlayStarted.
  lastPlayStartedAt: string | null;
  // A better-quality mp3 was found via slskd (or a configured commercial
  // HQ service) but not (yet) automatically downloaded — see
  // services/slskdQualityWorker.ts. Never true at the same time as
  // hqFileDownloaded below.
  betterQualityExists: boolean;
  // The HQ service actually downloaded and replaced the local file with a
  // higher-bitrate exact match — see services/hqReplace.ts.
  hqFileDownloaded: boolean;
  // User-toggled favourite flag — see toggleFavourite/getFavouritesSummary.
  isFavourite: boolean;
  // Only populated by cross-playlist endpoints (e.g. getAllTracks) — a
  // single-playlist fetch (getVideos) omits it since the page already knows
  // which playlist every row belongs to.
  playlistId?: string;
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
  betterQualityExists: boolean;
  hqFileDownloaded: boolean;
  position: number;
  releaseYear: number | null;
  fileSize: number | null;
  bitrate: number | null;
  downloadError: string | null;
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

  // Just the numbers the "All Tracks" row in the playlists list needs —
  // avoids pulling every video's full metadata just to render that summary.
  getAllTracksSummary: async (): Promise<{ songCount: number; totalDurationSec: number; totalSize: number }> => {
    const { data } = await client.get<{ songCount: number; totalDurationSec: number; totalSize: number }>('/playlists/all-tracks/summary');
    return data;
  },

  // The last MAX_HISTORY_ITEMS tracks played, most-recently-started first —
  // same shape as getAllTracks, capped instead of exhaustive.
  getHistory: async (): Promise<{ videos: PlaylistVideo[]; songCount: number; totalDurationSec: number }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[]; songCount: number; totalDurationSec: number }>(
      '/playlists/history'
    );
    return data;
  },

  // Just the numbers the "Listening History" row in the playlists list
  // needs — same rationale as getAllTracksSummary.
  getHistorySummary: async (): Promise<{ songCount: number; totalDurationSec: number; totalSize: number }> => {
    const { data } = await client.get<{ songCount: number; totalDurationSec: number; totalSize: number }>('/playlists/history/summary');
    return data;
  },

  // Just the numbers the "Favourites" row in the playlists list needs —
  // same rationale as getAllTracksSummary. Favourited tracks themselves are
  // viewed via getAllTracks with the favourite filter, not a separate list
  // endpoint.
  getFavouritesSummary: async (): Promise<{ songCount: number; totalDurationSec: number; totalSize: number }> => {
    const { data } = await client.get<{ songCount: number; totalDurationSec: number; totalSize: number }>('/playlists/favourites/summary');
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
    const { data } = await client.patch<{ playlist: Playlist }>(`/playlists/${id}`, {
      customName,
    });
    return data;
  },

  getVideos: async (id: string): Promise<{ videos: PlaylistVideo[] }> => {
    const { data } = await client.get<{ videos: PlaylistVideo[] }>(`/playlists/${id}/videos`);
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

  toggleFavourite: async (playlistId: string, videoId: string): Promise<{ isFavourite: boolean }> => {
    const { data } = await client.post<{ isFavourite: boolean }>(`/playlists/${playlistId}/videos/${videoId}/favourite`);
    return data;
  },

  markPlayed: async (playlistId: string, videoId: string): Promise<{ playCount: number; lastPlayedAt: string }> => {
    const { data } = await client.post<{ playCount: number; lastPlayedAt: string }>(
      `/playlists/${playlistId}/videos/${videoId}/played`
    );
    return data;
  },

  // Fired the instant playback starts (see PlayerContext) — separate from
  // markPlayed above, which only fires on natural completion.
  markPlayStarted: async (playlistId: string, videoId: string): Promise<{ lastPlayStartedAt: string }> => {
    const { data } = await client.post<{ lastPlayStartedAt: string }>(
      `/playlists/${playlistId}/videos/${videoId}/play-started`
    );
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

  // Re-checks metadata + HQ quality for already-downloaded videos only,
  // without touching YouTube — the only retry path that works for a
  // generated playlist at all (see scanForHqUpgrades in syncService.ts).
  // ignoreDuration mirrors the single-track "Search for HQ" action's own
  // behavior for this whole pass — see ScanHqDialog's toggle.
  scanHq: async (id: string, options: { ignoreDuration?: boolean } = {}): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/scan-hq`, options);
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

  downloadUrl: (playlistId: string, videoId: string): string =>
    `/api/playlists/${playlistId}/videos/${videoId}/download`,

  streamUrl: (playlistId: string, videoId: string): string =>
    `/api/playlists/${playlistId}/videos/${videoId}/stream`,

  remove: async (id: string): Promise<void> => {
    await client.delete(`/playlists/${id}`);
  },

  generateSimilar: async (id: string): Promise<{ playlist: Playlist }> => {
    const { data } = await client.post<{ playlist: Playlist }>(`/playlists/${id}/generate-similar`);
    return data;
  },
};
