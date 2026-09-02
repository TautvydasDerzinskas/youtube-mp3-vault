import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { useToast } from '../contexts/ToastContext';
import { setTrackScanning, useTrackScanningStatus } from './trackScanStatus';
import { pollForHqCompletion, renameTrackAndPoll } from './hqPolling';

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
 * header. Both need the same polling loop and toasts, so it lives here once
 * rather than copied per caller. The close-HQ-candidates result itself
 * (and the dialog offering it) isn't handled here any more — see
 * PendingHqCandidatesModal, mounted once at the layout level, for why a
 * per-row/per-hook-instance dialog couldn't reliably show it.
 */
export function useTrackActions({ video: v, playlistId: trackPlaylistId, isCurrentTrack, isAudioPlaying, onTogglePlay, onUpdated }: UseTrackActionsParams) {
  const { t } = useTranslation();
  const { showSuccess, showInfo, showError } = useToast();
  // Keyed by video id in a module-level store, not local useState — a
  // scanning/renaming track's row can be unmounted mid-poll by react-window
  // virtualization (scrolled out of view) and later remounted; local state
  // would silently reset on remount, losing the progress indicator even
  // though the background poll below kept running the whole time.
  const searching = useTrackScanningStatus(v.id);
  const callbacks = { onUpdated, showSuccess, showInfo, t };

  // Called from RenameTrackDialog (via TrackContextMenu).
  const handleRename = async (artist: string | null, title: string) => {
    if (isCurrentTrack && isAudioPlaying) onTogglePlay();
    const hadHq = v.hqFileDownloaded || v.betterQualityExists;
    await renameTrackAndPoll(trackPlaylistId, v.id, artist, title, hadHq, callbacks);
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
    const hadHq = v.hqFileDownloaded || v.betterQualityExists;
    pollForHqCompletion(trackPlaylistId, v.id, hadHq, 'search', callbacks);
  };

  return { searching, handleSearchHq, handleRename, handleToggleFavourite };
}
