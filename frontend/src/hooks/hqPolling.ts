import { TFunction } from 'i18next';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { setTrackScanning, setTrackCloseCandidates } from './trackScanStatus';

// 2s between polls — frequent enough that the caller's "in progress"
// indicator doesn't linger for long after the search actually finishes,
// cheap enough (one single-video GET) not to matter if a search runs a while.
const SEARCH_POLL_INTERVAL_MS = 2000;

export interface HqPollCallbacks {
  // Lets the caller patch its own copy of this track once a "Search for HQ"
  // or rename run finishes — absent when there's no such local copy to patch
  // (e.g. the always-mounted PendingHqCandidatesModal, which doesn't own any
  // list the track lives in).
  onUpdated?: (video: PlaylistVideo) => void;
  showSuccess: (message: string) => void;
  showInfo: (message: string) => void;
  t: TFunction;
}

// Shared tail end of both Search for HQ and Rename track — extracted out of
// useTrackActions so the always-mounted PendingHqCandidatesModal (see
// AppLayout.tsx) can drive the exact same rename-then-poll lifecycle for a
// candidate picked from a track whose row may no longer be mounted, without
// needing a live useTrackActions instance for that track. Polls
// GET .../videos/:videoId (the same single-video endpoint TrackDetailPage
// already uses) until its searchingHq field flips back to false — that
// response already carries whatever changed (bitrate, hqFileDownloaded,
// mediaFileId, artist, title, ...), so no separate "fetch the updated video"
// call is needed once it's done. `mode` only controls which toast(s) fire —
// rename always confirms the rename itself, and either mode reports a newly
// found HQ upgrade the same way (search additionally reports "found
// nothing", which doesn't apply to rename: not finding an HQ upgrade was
// never rename's main point, so staying quiet about it there avoids
// implying the rename itself came up short).
export function pollForHqCompletion(
  playlistId: string, videoId: string, hadHq: boolean, mode: 'search' | 'rename', callbacks: HqPollCallbacks,
): void {
  const { onUpdated, showSuccess, showInfo, t } = callbacks;
  const poll = async () => {
    try {
      const { video: fresh, searchingHq, closeHqCandidates } = await playlistsApi.getVideo(playlistId, videoId);
      if (searchingHq) {
        setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
        return;
      }
      setTrackScanning(videoId, false);
      onUpdated?.(fresh);
      if (mode === 'rename') {
        showSuccess(t('playlists.videoList.trackRenamed', { title: fresh.title }));
      }
      const foundHq = fresh.hqFileDownloaded || fresh.betterQualityExists;
      if (foundHq && !hadHq) {
        showSuccess(t('playlists.videoList.hqFoundForTrack', { title: fresh.title }));
      } else if (mode === 'search' && !foundHq) {
        // Deezer/Qobuz/Tidal turning up real-but-unconfident results is a
        // richer signal than plain "nothing found" — offer them as
        // one-click rename suggestions instead of the plain toast.
        if (closeHqCandidates.length > 0) {
          setTrackCloseCandidates(videoId, closeHqCandidates, {
            playlistId,
            video: { id: fresh.id, youtubeId: fresh.youtubeId, originalTitle: fresh.originalTitle, title: fresh.title, artist: fresh.artist, duration: fresh.duration },
            hadHq: foundHq,
          });
        } else {
          showInfo(t('playlists.videoList.hqNotFoundForTrack', { title: fresh.title }));
        }
      }
    } catch {
      // Network hiccup — stop polling silently rather than spin forever.
      setTrackScanning(videoId, false);
    }
  };
  setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
}

// Shared by useTrackActions' handleRename (row-triggered) and
// PendingHqCandidatesModal's candidate selection (row-independent — reuses
// this instead of duplicating the POST-then-poll lifecycle). Only awaits the
// initial POST, not the background metadata/HQ-search follow-up it kicks
// off, so the caller (a dialog) can close right away and let the track's own
// "in progress" indicator (the store's `scanning` flag) carry the rest.
// Rethrows on failure so the caller can surface the error instead of
// silently swallowing it.
export async function renameTrackAndPoll(
  playlistId: string, videoId: string, artist: string | null, title: string, hadHq: boolean, callbacks: HqPollCallbacks,
): Promise<void> {
  setTrackScanning(videoId, true);
  try {
    await playlistsApi.renameTrack(playlistId, videoId, artist, title);
  } catch (err) {
    setTrackScanning(videoId, false);
    throw err;
  }
  pollForHqCompletion(playlistId, videoId, hadHq, 'rename', callbacks);
}
