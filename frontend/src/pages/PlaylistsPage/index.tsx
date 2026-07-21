import { useMemo, useState } from 'react';
import { Box, Typography, Button, Alert, CircularProgress, Stack } from '@mui/material';
import { Add as AddIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../api/youtube';
import { usePlaylists } from './hooks/usePlaylists';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { AddPlaylistDialog } from './AddPlaylistDialog';
import { RenameDialog } from './RenameDialog';
import { PlaylistRow } from './PlaylistRow';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { displayName } from './utils';

export default function PlaylistsPage() {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [generating, setGenerating] = useState<Playlist | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const { lastfmDiscoverAvailable } = useAuth();
  const canGenerateSimilar = online && lastfmDiscoverAvailable;

  const {
    playlists, loading, error, syncing, retrying, videoCache, setVideoCache,
    expanded, setExpanded, updatePlaylist, handleAdded, handleSync,
    handleRetryFailed, handleTogglePause, handleDelete: rawHandleDelete,
    handleGenerateSimilar,
  } = usePlaylists();

  const { nowPlaying, isAudioPlaying, handleTogglePlay, stopIfPlaylist } = usePlayer();

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

  // Composed here (rather than threaded through usePlaylists) so the two hooks
  // stay independent: stop playback if the playlist being deleted is playing.
  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await rawHandleDelete(deleting);
      stopIfPlaylist(deleting.id);
      setDeleting(null);
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={700}>{t('playlists.title')}</Typography>
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
          expanded={expanded === playlist.id}
          onToggleExpand={open => setExpanded(open ? playlist.id : false)}
          isSyncingLocally={syncing.has(playlist.id)}
          isRetryingLocally={retrying.has(playlist.id)}
          online={online}
          canGenerateSimilar={canGenerateSimilar}
          hasGeneratedPlaylist={generatedSourceIds.has(playlist.id)}
          isLockedBySource={busyGeneratedSourceIds.has(playlist.id)}
          videoCache={videoCache}
          setVideoCache={setVideoCache}
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onTogglePlay={handleTogglePlay}
          onRename={setRenaming}
          onSync={handleSync}
          onRetryFailed={handleRetryFailed}
          onTogglePause={handleTogglePause}
          onDelete={setDeleting}
          onGenerateSimilar={(e, playlist) => { e.stopPropagation(); setGenerateError(null); setGenerating(playlist); }}
        />
      ))}

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
    </Box>
  );
}
