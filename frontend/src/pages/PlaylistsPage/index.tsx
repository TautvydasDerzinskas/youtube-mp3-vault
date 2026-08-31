import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Button, Alert, CircularProgress, Stack, Divider } from '@mui/material';
import { Add as AddIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Playlist, playlistsApi } from '../../api/youtube';
import { SyncReport, syncReportsApi } from '../../api/syncReports';
import { usePlaylists } from './hooks/usePlaylists';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePageBack, usePageTitle } from '../../contexts/PageBackContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { AddPlaylistDialog } from './AddPlaylistDialog';
import { RenameDialog } from './RenameDialog';
import { PlaylistRow } from './PlaylistRow';
import { AllTracksListItem } from './AllTracksListItem';
import { FavouritesListItem } from './FavouritesListItem';
import { HistoryListItem } from './HistoryListItem';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ScanHqDialog } from './ScanHqDialog';
import { SyncReportModal } from './SyncReportModal';
import { displayName } from './utils';

export default function PlaylistsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  usePageBack('/dashboard', t('common.backToDashboard'));
  usePageTitle(t('playlists.title'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  // Lets the top bar's global "Import" button (see TopBar/MobileTopBar) open
  // this dialog from any page — it navigates here with ?add=1, which this
  // opens once and then strips from the URL so it doesn't reopen on a later
  // refresh/back-navigation to this same address.
  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    setAddOpen(true);
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [generating, setGenerating] = useState<Playlist | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [scanningHq, setScanningHq] = useState<Playlist | null>(null);
  const [scanHqLoading, setScanHqLoading] = useState(false);
  const online = useOnlineStatus();
  const { lastfmDiscoverAvailable } = useAuth();
  const canGenerateSimilar = online && lastfmDiscoverAvailable;

  // Populated only by the busy-transition effect below — a run that
  // finishes while the user is already sitting on this page pops the modal
  // live. Deliberately NOT fetched on mount any more: a run that finished
  // before this page was even opened surfaces through the notification bell
  // instead (see NotificationsContext), not retroactively as this modal.
  const [unseenReports, setUnseenReports] = useState<SyncReport[]>([]);

  const {
    playlists, loading, error, syncing, retrying, updatePlaylist, handleAdded, handleSync,
    handleRetryFailed, handleScanHq, handleTogglePause, handleDelete: rawHandleDelete,
    handleGenerateSimilar,
  } = usePlaylists();

  // usePlaylists already polls the playlist list every ~3s while anything is
  // syncing/retrying (see its schedulePoll) — this piggybacks on that same
  // polled data rather than running its own timer. Whenever a playlist id
  // that was mid-run on the previous check is no longer mid-run now, that's
  // a sync/retry/scan-hq pass finishing — syncStatus flips back to idle/
  // error a moment before its SyncReport row is actually written (see
  // downloadPendingVideos's finally block in syncService.ts), but that gap
  // is milliseconds against a 3s poll interval, so by the time this fetch
  // lands the report is already there. New reports are appended rather than
  // replacing the array, so this can't disrupt a queue the modal is already
  // partway through showing.
  const previouslyBusyIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const busyIds = new Set(
      playlists.filter(p => p.syncStatus === 'syncing' || p.syncStatus === 'retrying' || p.syncStatus === 'scanning_hq').map(p => p.id)
    );
    const justFinished = [...previouslyBusyIdsRef.current].some(id => !busyIds.has(id));
    previouslyBusyIdsRef.current = busyIds;
    if (!justFinished) return;

    syncReportsApi.listUnseen().then(fresh => {
      setUnseenReports(prev => {
        const knownIds = new Set(prev.map(r => r.id));
        const additions = fresh.filter(r => !knownIds.has(r.id));
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }).catch(() => {});
  }, [playlists]);

  const { nowPlaying, isAudioPlaying, handleTogglePlay, stopIfPlaylist, isShuffle } = usePlayer();

  // A generated playlist's own row already shows this in its own list entry
  // (via sourcePlaylistId/sourcePlaylistName) — derived here from the same
  // already-loaded list so the SOURCE playlist's row can, in turn, know
  // whether a derivative already exists for it (hide "Generate similar" for
  // good, only one is ever allowed) and whether that derivative is still
  // being built (lock rename/delete/sync on the source while it's reading
  // from it, to avoid the video list shifting out from under it).
  const { generatedSourceIds, busyGeneratedSourceIds } = useMemo(() => {
    const generated = new Set<string>();
    const busy = new Set<string>();
    for (const p of playlists) {
      if (!p.sourcePlaylistId) continue;
      generated.add(p.sourcePlaylistId);
      if (p.syncStatus === 'generating' || p.syncStatus === 'syncing') {
        busy.add(p.sourcePlaylistId);
      }
    }
    return { generatedSourceIds: generated, busyGeneratedSourceIds: busy };
  }, [playlists]);

  // Navigates immediately (feels responsive) and starts playback in the
  // background once the video list resolves — same queue-building logic
  // handleTogglePlay would do on its own, done here up front so the very
  // first track played is deterministically the playlist's first (by
  // position), not whatever the queue fetch happens to put first — unless
  // shuffle is on, in which case starting on track 1 every time would defeat
  // the point, so a random track is picked instead.
  const handlePlayFirst = async (e: React.MouseEvent, playlist: Playlist) => {
    e.stopPropagation();
    navigate(`/playlists/${playlist.id}`);
    try {
      const { videos } = await playlistsApi.getVideos(playlist.id);
      const playable = videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position);
      if (playable.length === 0) return;
      // Already playing this playlist — toggle pause/resume on the current
      // track instead of jumping to a new (possibly random) one.
      const isCurrentPlaylist = nowPlaying?.playlistId === playlist.id;
      const startTrack = isCurrentPlaylist
        ? (playable.find(v => v.id === nowPlaying!.videoId) ?? playable[0])
        : (isShuffle ? playable[Math.floor(Math.random() * playable.length)] : playable[0]);
      handleTogglePlay(playlist.id, startTrack, playable);
    } catch {
      // navigation already happened — nothing else to do
    }
  };

  const handleConfirmGenerate = async () => {
    if (!generating) return;
    setGenerateLoading(true);
    setGenerateError(null);
    try {
      await handleGenerateSimilar(generating.id);
      setGenerating(null);
    } catch (err: any) {
      setGenerateError(err.response?.data?.error ?? t('playlists.generateSimilarError'));
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleConfirmScanHq = async (matchDuration: boolean) => {
    if (!scanningHq) return;
    setScanHqLoading(true);
    await handleScanHq(scanningHq.id, !matchDuration);
    setScanHqLoading(false);
    setScanningHq(null);
  };

  // Composed here (rather than threaded through usePlaylists) so the two hooks
  // stay independent: stop playback if the playlist being deleted is playing.
  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const deleted = await rawHandleDelete(deleting);
      if (deleted) {
        stopIfPlaylist(deleting.id);
        setDeleting(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent={isMobile ? 'space-between' : 'flex-end'} mb={3}>
        {isMobile && <Typography variant="h5" fontWeight={700}>{t('playlists.title')}</Typography>}
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>{t('playlists.addPlaylist')}</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {generateError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setGenerateError(null)}>{generateError}</Alert>
      )}

      {!online && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('playlists.offlineBanner')}
        </Alert>
      )}

      {playlists.length === 0 && !error && (
        <Box sx={{ textAlign: 'center', mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <MusicNoteIcon sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.3 }} />
          <Typography color="text.secondary">
            {t('playlists.emptyState')}
          </Typography>
        </Box>
      )}

      {playlists.map(playlist => (
        <PlaylistRow
          key={playlist.id}
          playlist={playlist}
          isSyncingLocally={syncing.has(playlist.id)}
          isRetryingLocally={retrying.has(playlist.id)}
          online={online}
          canGenerateSimilar={canGenerateSimilar}
          hasGeneratedPlaylist={generatedSourceIds.has(playlist.id)}
          isLockedBySource={busyGeneratedSourceIds.has(playlist.id)}
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onPlayFirst={handlePlayFirst}
          onRename={setRenaming}
          onSync={handleSync}
          onRetryFailed={handleRetryFailed}
          onScanHq={(e, playlist) => { e.stopPropagation(); setScanningHq(playlist); }}
          onTogglePause={handleTogglePause}
          onDelete={setDeleting}
          onGenerateSimilar={(e, playlist) => { e.stopPropagation(); setGenerateError(null); setGenerating(playlist); }}
        />
      ))}

      <Divider sx={{ my: 2, borderColor: 'divider' }} />
      <FavouritesListItem refreshOn={playlists} />
      <HistoryListItem refreshOn={playlists} />
      <AllTracksListItem refreshOn={playlists} />

      <AddPlaylistDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      {renaming && (
        <RenameDialog playlist={renaming} onClose={() => setRenaming(null)}
          onRenamed={updated => { updatePlaylist(updated); setRenaming(null); }} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('playlists.deleteConfirm.title')}
          message={t('playlists.deleteConfirm.message', { name: displayName(deleting) })}
          confirmLabel={t('playlists.remove')}
          destructive
          loading={deleteLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {generating && (
        <ConfirmDialog
          title={t('playlists.generateSimilarConfirm.title')}
          message={t('playlists.generateSimilarConfirm.message', { name: displayName(generating) })}
          confirmLabel={t('playlists.generateSimilar')}
          loading={generateLoading}
          onConfirm={handleConfirmGenerate}
          onCancel={() => setGenerating(null)}
        />
      )}
      {scanningHq && (
        <ScanHqDialog
          loading={scanHqLoading}
          onConfirm={handleConfirmScanHq}
          onCancel={() => setScanningHq(null)}
        />
      )}
      {unseenReports.length > 0 && (
        <SyncReportModal reports={unseenReports} onDone={() => setUnseenReports([])} />
      )}
    </Box>
  );
}
