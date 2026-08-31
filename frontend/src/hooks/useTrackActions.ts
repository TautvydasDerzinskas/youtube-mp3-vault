import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo, CloseHqCandidate } from '../api/youtube';
import { useToast } from '../contexts/ToastContext';
import { setTrackScanning, useTrackScanningStatus } from './trackScanStatus';

// 2s between polls — frequent enough that the caller's "in progress"
// indicator doesn't linger for long after the search actually finishes,
// cheap enough (one single-video GET) not to matter if a search runs a while.
const SEARCH_POLL_INTERVAL_MS = 2000;

interface UseTrackActionsParams {
  video: PlaylistVideo;
  playlistId: string;
  isCurrentTrack: boolean;
  isAudioPlaying: boolean;
  onTogglePlay: () => void;
  // Lets the caller patch its own copy of this track once a "Search for HQ"
  // or rename run finishes.
  onUpdated?: (video: PlaylistVideo) => void;
}

/**
 * Search-for-HQ / rename lifecycle shared by every place a track can trigger
 * either — TrackRow (via the shared row component) and TrackDetailPage's own
 * header. Both need the same polling loop, toasts, and close-HQ-candidate
 * handling, so it lives here once rather than copied per caller.
 */
export function useTrackActions({ video: v, playlistId: trackPlaylistId, isCurrentTrack, isAudioPlaying, onTogglePlay, onUpdated }: UseTrackActionsParams) {
  const { t } = useTranslation();
  const { showSuccess, showInfo, showError } = useToast();
  // Keyed by video id in a module-level store, not local useState — a
  // scanning/renaming track's row can be unmounted mid-poll by react-window
  // virtualization (scrolled out of view) and later remounted; local state
  // would silently reset to false on remount, losing the progress indicator
  // even though the background poll below kept running the whole time.
  const searching = useTrackScanningStatus(v.id);
  const [closeCandidates, setCloseCandidates] = useState<CloseHqCandidate[]>([]);

  // Shared tail end of both Search for HQ and Rename track — polls GET
  // .../videos/:videoId (the same single-video endpoint TrackDetailPage
  // already uses) until its searchingHq field flips back to false — that
  // response already carries whatever changed (bitrate, hqFileDownloaded,
  // mediaFileId, artist, title, ...), so no separate "fetch the updated
  // video" call is needed once it's done. `mode` only controls which
  // toast(s) fire — rename always confirms the rename itself, and either
  // mode reports a newly-found HQ upgrade the same way (search additionally
  // reports "found nothing", which doesn't apply to rename: not finding an
  // HQ upgrade was never rename's main point, so staying quiet about it
  // there avoids implying the rename itself came up short).
  const pollForCompletion = (mode: 'search' | 'rename') => {
    const hadHq = v.hqFileDownloaded || v.betterQualityExists;
    const poll = async () => {
      try {
        const { video: fresh, searchingHq, closeHqCandidates } = await playlistsApi.getVideo(trackPlaylistId, v.id);
        if (searchingHq) {
          setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
          return;
        }
        setTrackScanning(v.id, false);
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
            setCloseCandidates(closeHqCandidates);
          } else {
            showInfo(t('playlists.videoList.hqNotFoundForTrack', { title: fresh.title }));
          }
        }
      } catch {
        // Network hiccup — stop polling silently rather than spin forever.
        setTrackScanning(v.id, false);
      }
    };
    setTimeout(poll, SEARCH_POLL_INTERVAL_MS);
  };

  const handleDismissCloseCandidates = () => {
    setCloseCandidates([]);
    playlistsApi.dismissHqCandidates(trackPlaylistId, v.id).catch(() => {});
  };

  // Called from RenameTrackDialog (via TrackContextMenu) — only awaits the
  // initial POST, not the background metadata/HQ-search follow-up it kicks
  // off, so the dialog can close right away and let the caller's own
  // "in progress" indicator carry the rest (same one Search for HQ uses).
  // Rethrows on failure so the dialog can show the error inline instead of
  // closing.
  const handleRename = async (artist: string | null, title: string) => {
    if (isCurrentTrack && isAudioPlaying) onTogglePlay();

    setTrackScanning(v.id, true);
    try {
      await playlistsApi.renameTrack(trackPlaylistId, v.id, artist, title);
    } catch (err) {
      setTrackScanning(v.id, false);
      throw err;
    }
    pollForCompletion('rename');
  };

  // Picking a suggestion is just a rename to that exact artist/title —
  // reuses the same rename lifecycle (spinner, disabled menu actions, the
  // "found"/"renamed" toasts from pollForCompletion above) rather than any
  // separate code path.
  const handleSelectCloseCandidate = async (artist: string, title: string) => {
    setCloseCandidates([]);
    try {
      await handleRename(artist, title);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.videoList.renameError'));
    }
  };

  // Instant toggle, no polling lifecycle needed — the backend just flips the
  // one flag and returns it, unlike Search for HQ/rename's async follow-up.
  const handleToggleFavourite = async () => {
    try {
      const { isFavourite } = await playlistsApi.toggleFavourite(trackPlaylistId, v.id);
      onUpdated?.({ ...v, isFavourite });
      showSuccess(t(isFavourite ? 'playlists.videoList.favouriteAdded' : 'playlists.videoList.favouriteRemoved', { title: v.title }));
    } catch {
      // Silent — a transient failure here just leaves the heart as it was,
      // no worse than the click never having registered.
    }
  };

  const handleSearchHq = async () => {
    // A found-and-replaced file would disrupt playback out from under the
    // user mid-song — stop it up front rather than let that happen silently.
    if (isCurrentTrack && isAudioPlaying) onTogglePlay();

    setTrackScanning(v.id, true);
    try {
      await playlistsApi.searchTrackHq(trackPlaylistId, v.id);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.videoList.searchHqError'));
      setTrackScanning(v.id, false);
      return;
    }
    pollForCompletion('search');
  };

  return {
    searching, closeCandidates, handleSearchHq, handleRename,
    handleDismissCloseCandidates, handleSelectCloseCandidate, handleToggleFavourite,
  };
}
