import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Banner, Button, FAB, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { playlistsApi, Playlist } from '../api/playlists';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePlaylists } from './playlists/usePlaylists';
import { PlaylistRow } from './playlists/PlaylistRow';
import { AddPlaylistDialog } from './playlists/AddPlaylistDialog';
import { RenameDialog } from './playlists/RenameDialog';
import { AllTracksListItem } from './playlists/AllTracksListItem';
import { displayName } from '../utils/format';

// Mirrors frontend/src/pages/PlaylistsPage/index.tsx — see PlaylistRow.tsx
// for what's adapted for mobile (no accordion, sync stays the one visible
// icon, Generate Similar folded into the "⋮" menu). "All Tracks" isn't
// ported yet (no mobile screen for it).
export function PlaylistsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const online = useOnlineStatus();
  const { lastfmDiscoverAvailable } = useAuth();
  const { handleTogglePlay, stopIfPlaylist } = usePlayer();
  const {
    playlists, loading, error,
    handleAdded, handleSync, handleRetryFailed, handleScanHq, handleTogglePause, handleRename, handleDelete, handleGenerateSimilar,
  } = usePlaylists();

  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [generating, setGenerating] = useState<Playlist | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const canGenerateSimilar = online && lastfmDiscoverAvailable;

  const generatedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of playlists) if (p.sourcePlaylistId) set.add(p.sourcePlaylistId);
    return set;
  }, [playlists]);

  const busyGeneratedSourceIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of playlists) {
      if (p.sourcePlaylistId && (p.syncStatus === 'generating' || p.syncStatus === 'syncing')) {
        set.add(p.sourcePlaylistId);
      }
    }
    return set;
  }, [playlists]);

  const handlePlayFirst = async (playlist: Playlist) => {
    navigation.navigate('PlaylistDetail', { playlistId: playlist.id });
    try {
      const { videos } = await playlistsApi.getVideos(playlist.id);
      const playable = videos.filter(v => v.downloadStatus === 'done').sort((a, b) => a.position - b.position);
      if (playable.length > 0) handleTogglePlay(playlist.id, playable[0], playable);
    } catch {
      // Navigation already happened — nothing else to do.
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await handleDelete(deleting);
      stopIfPlaylist(deleting.id);
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
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
      setGenerateError(err?.response?.data?.error ?? t('playlists.generateSimilarError'));
    } finally {
      setGenerateLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {!online && (
        <Banner visible icon="wifi-off">{t('playlists.offlineBanner')}</Banner>
      )}
      {generateError && (
        <Banner visible icon="alert-circle-outline" actions={[{ label: t('common.cancel'), onPress: () => setGenerateError(null) }]}>
          {generateError}
        </Banner>
      )}

      {error ? (
        <View style={styles.center}>
          <Text>{t('playlists.loadError')}</Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PlaylistRow
              playlist={item}
              online={online}
              canGenerateSimilar={canGenerateSimilar}
              hasGeneratedPlaylist={generatedSourceIds.has(item.id)}
              isLockedBySource={busyGeneratedSourceIds.has(item.id)}
              onOpen={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
              onPlayFirst={() => handlePlayFirst(item)}
              onSync={() => handleSync(item.id)}
              onRetryFailed={() => handleRetryFailed(item.id)}
              onScanHq={() => handleScanHq(item.id)}
              onTogglePause={() => handleTogglePause(item)}
              onRename={() => setRenaming(item)}
              onDelete={() => setDeleting(item)}
              onGenerateSimilar={() => { setGenerateError(null); setGenerating(item); }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="music-note-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>{t('playlists.emptyState')}</Text>
            </View>
          }
          ListFooterComponent={<AllTracksListItem refreshOn={playlists} />}
        />
      )}

      <FAB icon="plus" style={styles.fab} onPress={() => setAddOpen(true)} label={t('playlists.addPlaylist')} />

      <AddPlaylistDialog visible={addOpen} onClose={() => setAddOpen(false)} onAdded={handleAdded} />

      {renaming && (
        <RenameDialog playlist={renaming} onClose={() => setRenaming(null)} onRename={handleRename} />
      )}

      {deleting && (
        <ConfirmDialog
          visible
          title={t('playlists.deleteConfirm.title')}
          message={t('playlists.deleteConfirm.message', { name: displayName(deleting) })}
          confirmLabel={t('playlists.remove')}
          cancelLabel={t('common.cancel')}
          loading={deleteLoading}
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {generating && (
        <ConfirmDialog
          visible
          title={t('playlists.generateSimilarConfirm.title')}
          message={t('playlists.generateSimilarConfirm.message', { name: displayName(generating) })}
          confirmLabel={t('playlists.generateSimilar')}
          cancelLabel={t('common.cancel')}
          loading={generateLoading}
          onConfirm={handleConfirmGenerate}
          onCancel={() => setGenerating(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center', padding: 24, paddingTop: 48 },
  list: { padding: 12, paddingBottom: 96 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
