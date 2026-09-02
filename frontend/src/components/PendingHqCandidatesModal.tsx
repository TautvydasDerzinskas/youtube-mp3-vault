import { useTranslation } from 'react-i18next';
import { playlistsApi } from '../api/youtube';
import { useToast } from '../contexts/ToastContext';
import { usePlayer } from '../contexts/PlayerContext';
import { usePendingHqCandidates, setTrackCloseCandidates } from '../hooks/trackScanStatus';
import { renameTrackAndPoll } from '../hooks/hqPolling';
import { CloseHqCandidatesDialog } from './CloseHqCandidatesDialog';

// Always mounted at the layout level (see AppLayout.tsx) rather than inside
// any one track row. A "Search for HQ" run's close-candidates result used
// to only ever surface via a dialog rendered inside the row that started
// it — react-window virtualizes the track list, so scrolling away (or
// navigating off the page entirely) while the search was still running in
// the background meant the result silently never appeared once it finished.
// The search itself, and its result, already live in trackScanStatus.ts's
// module-level store regardless of any row's mount state — this just makes
// sure something is always mounted to read it and show the dialog. Shows
// one dialog at a time (oldest pending track first, see
// usePendingHqCandidates) — triggering several searches before any of them
// finish queues their results instead of one clobbering another or getting
// dropped.
export function PendingHqCandidatesModal() {
  const { t } = useTranslation();
  const { showSuccess, showInfo, showError } = useToast();
  const { nowPlaying, isAudioPlaying, handlePause } = usePlayer();
  const pending = usePendingHqCandidates();

  if (pending.length === 0) return null;
  const current = pending[0];

  const handleDismiss = () => {
    setTrackCloseCandidates(current.video.id, []);
    playlistsApi.dismissHqCandidates(current.playlistId, current.video.id).catch(() => {});
  };

  // Picking a suggestion is just a rename to that exact artist/title — reuses
  // the same rename-then-poll lifecycle a row's own "Rename" action uses
  // (the "found"/"renamed" toasts, the row's progress bar via the shared
  // scanning store), rather than a separate code path. Pauses playback first
  // if this is the track currently playing, matching a row-triggered
  // rename's own "don't let a found-and-replaced file disrupt playback out
  // from under the user" behavior — done directly via PlayerContext here
  // since there's no row-bound onTogglePlay to call.
  const handleSelect = async (artist: string, title: string) => {
    setTrackCloseCandidates(current.video.id, []);
    if (nowPlaying?.videoId === current.video.id && isAudioPlaying) handlePause();
    try {
      await renameTrackAndPoll(current.playlistId, current.video.id, artist, title, current.hadHq, { showSuccess, showInfo, t });
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.videoList.renameError'));
    }
  };

  return (
    <CloseHqCandidatesDialog
      key={current.video.id}
      video={current.video}
      candidates={current.candidates}
      onDismiss={handleDismiss}
      onSelect={handleSelect}
    />
  );
}
