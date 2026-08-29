import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Banner, FAB, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { playlistsApi, Playlist } from '../api/playlists';
import { SyncReport, syncReportsApi } from '../api/syncReports';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useOfflineDownloads } from '../offline/OfflineDownloadsContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ScanHqDialog } from '../components/ScanHqDialog';
import { usePlaylists } from './playlists/usePlaylists';
import { PlaylistRow } from './playlists/PlaylistRow';
import { AddPlaylistDialog } from './playlists/AddPlaylistDialog';
import { RenameDialog } from './playlists/RenameDialog';
import { AllTracksListItem } from './playlists/AllTracksListItem';
import { SyncReportModal } from './playlists/SyncReportModal';
import { OfflineSyncDiffModal } from './playlists/OfflineSyncDiffModal';
import { displayName } from '../utils/format';

// Mirrors frontend/src/pages/PlaylistsPage/index.tsx — see PlaylistRow.tsx
// for what's adapted for mobile (no accordion, sync stays the one visible
// icon, Generate Similar folded into the "⋮" menu). "All Tracks" isn't
// ported yet (no mobile screen for it). The sync-report stats modal is,
// though — see SyncReportModal.tsx and the unseenReports fetch below.
export function PlaylistsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const online = useOnlineStatus();
  const { lastfmDiscoverAvailable } = useAuth();
  const { nowPlaying, isAudioPlaying, handleTogglePlay, stopIfPlaylist, isShuffle } = usePlayer();
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
  const [syncingOffline, setSyncingOffline] = useState<Playlist | null>(null);
  const [scanningHq, setScanningHq] = useState<Playlist | null>(null);
  const [scanHqLoading, setScanHqLoading] = useState(false);
  const { diffs: offlineDiffs } = useOfflineDownloads();

  const canGenerateSimilar = online && lastfmDiscoverAvailable;

  // Fetched once on mount — whatever's unseen at that point is shown as a
  // queue in SyncReportModal. Also re-checked below whenever a playlist
  // that was busy stops being busy, so a run that finishes while the user
  // is still sitting on this screen pops the modal too, not just ones from
  // before the screen was opened (mirrors web's PlaylistsPage).
  const [unseenReports, setUnseenReports] = useState<SyncReport[]>([]);
  useEffect(() => {
    syncReportsApi.listUnseen().then(setUnseenReports).catch(() => {});
  }, []);

  // usePlaylists already polls the playlist list every ~3s while anything is
  // syncing/retrying/generating (see its schedulePoll) — this piggybacks on
  // that same polled data rather than running its own timer. Whenever a
  // playlist id that was mid-run on the previous check is no longer mid-run
  // now, that's a sync/retry/scan-hq pass finishing — syncStatus flips back
  // to idle/error a moment before its SyncReport row is actually written
  // (see downloadPendingVideos's finally block in backend/syncService.ts),
  // but that gap is milliseconds against a 3s poll interval, so by the time
  // this fetch lands the report is already there. New reports are appended
  // rather than replacing the array, so this can't disrupt a queue the
  // modal is already partway through showing.
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
      if (playable.length === 0) return;
      // Already playing this playlist — toggle pause/resume on the current
      // track instead of jumping to a new (possibly random) one.
      const isCurrentPlaylist = nowPlaying?.playlistId === playlist.id;
      const startTrack = isCurrentPlaylist
        ? (playable.find(v => v.id === nowPlaying!.videoId) ?? playable[0])
        : (isShuffle ? playable[Math.floor(Math.random() * playable.length)] : playable[0]);
      handleTogglePlay(playlist.id, startTrack, playable);
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

  const handleConfirmScanHq = async (matchDuration: boolean) => {
    if (!scanningHq) return;
    setScanHqLoading(true);
    try {
      await handleScanHq(scanningHq.id, !matchDuration);
    } finally {
      setScanHqLoading(false);
      setScanningHq(null);
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
              isPlaying={nowPlaying?.playlistId === item.id && isAudioPlaying}
              onOpen={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
              onPlayFirst={() => handlePlayFirst(item)}
              onSync={() => handleSync(item.id)}
              onRetryFailed={() => handleRetryFailed(item.id)}
              onScanHq={() => setScanningHq(item)}
              onTogglePause={() => handleTogglePause(item)}
              onRename={() => setRenaming(item)}
              onDelete={() => setDeleting(item)}
              onGenerateSimilar={() => { setGenerateError(null); setGenerating(item); }}
              onSyncOffline={() => setSyncingOffline(item)}
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

      {scanningHq && (
        <ScanHqDialog
          title={t('playlists.scanHqConfirm.title')}
          message={t('playlists.scanHqConfirm.message')}
          matchDurationLabel={t('playlists.scanHqConfirm.matchDurationLabel')}
          confirmLabel={t('playlists.scanHq')}
          cancelLabel={t('common.cancel')}
          loading={scanHqLoading}
          onConfirm={handleConfirmScanHq}
          onCancel={() => setScanningHq(null)}
        />
      )}

      {syncingOffline && offlineDiffs[syncingOffline.id] && (
        <OfflineSyncDiffModal
          playlistId={syncingOffline.id}
          diff={offlineDiffs[syncingOffline.id]}
          onClose={() => setSyncingOffline(null)}
        />
      )}

      {unseenReports.length > 0 && (
        <SyncReportModal reports={unseenReports} onDone={() => setUnseenReports([])} />
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
