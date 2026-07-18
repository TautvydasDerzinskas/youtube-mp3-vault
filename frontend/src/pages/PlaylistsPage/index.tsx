import { useState } from 'react';
import { Box, Typography, Button, Alert, CircularProgress, Stack } from '@mui/material';
import { Add as AddIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { Playlist } from '../../api/youtube';
import { usePlaylists } from './hooks/usePlaylists';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { AddPlaylistDialog } from './AddPlaylistDialog';
import { RenameDialog } from './RenameDialog';
import { PlaylistRow } from './PlaylistRow';
import { MiniPlayer } from './MiniPlayer';

export default function PlaylistsPage() {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const online = useOnlineStatus();

  const {
    playlists, loading, error, syncing, videoCache, setVideoCache,
    expanded, setExpanded, updatePlaylist, handleAdded, handleSync,
    handleRetryFailed, handleTogglePause, handleDelete: rawHandleDelete,
  } = usePlaylists();

  const {
    nowPlaying, isAudioPlaying, setIsAudioPlaying, audioRef,
    handleTogglePlay, handleTrackEnded, stopIfPlaylist, handleClosePlayer, nowPlayingVideo,
  } = useAudioPlayer(videoCache);

  // Composed here (rather than threaded through usePlaylists) so the two hooks
  // stay independent: stop playback if the playlist being deleted is playing.
  const handleDelete = async (e: React.MouseEvent, playlist: Playlist) => {
    await rawHandleDelete(e, playlist);
    stopIfPlaylist(playlist.id);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 3, pb: nowPlaying ? 9 : 3, maxWidth: 900 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={700}>{t('playlists.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>{t('playlists.addPlaylist')}</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
          online={online}
          videoCache={videoCache}
          setVideoCache={setVideoCache}
          nowPlaying={nowPlaying}
          isAudioPlaying={isAudioPlaying}
          onTogglePlay={handleTogglePlay}
          onRename={setRenaming}
          onSync={handleSync}
          onRetryFailed={handleRetryFailed}
          onTogglePause={handleTogglePause}
          onDelete={handleDelete}
        />
      ))}

      <AddPlaylistDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      {renaming && (
        <RenameDialog playlist={renaming} onClose={() => setRenaming(null)}
          onRenamed={updated => { updatePlaylist(updated); setRenaming(null); }} />
      )}

      {/* Mini player — shown whenever something is playing; drives auto-advance */}
      {nowPlaying && (
        <MiniPlayer
          title={nowPlayingVideo?.title}
          audioRef={audioRef}
          onPlay={() => setIsAudioPlaying(true)}
          onPause={() => setIsAudioPlaying(false)}
          onEnded={handleTrackEnded}
          onClose={handleClosePlayer}
        />
      )}
    </Box>
  );
}
