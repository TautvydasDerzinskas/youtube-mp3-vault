import { useState } from 'react';
import { Menu } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/playlists';
import { ConfirmDialog } from './ConfirmDialog';
import { showToast } from '../utils/toast';

interface TrackContextMenuProps {
  playlistId: string;
  video: PlaylistVideo;
  // Screen coordinates from the row's onLongPress event — null closes/hides
  // the menu. Position-anchored (Paper's Menu supports an {x,y} anchor)
  // rather than element-anchored, since the trigger is a long-press
  // anywhere on the row, not a fixed icon button.
  position: { x: number; y: number } | null;
  onDismiss: () => void;
  // Lets the caller drop this row from its own local list immediately
  // instead of waiting for a refetch — optional since some screens don't
  // hold mutable list state to update.
  onDeleted?: (videoId: string) => void;
  // True while TrackRow's own "Search for HQ" poll loop is running — Delete
  // is disabled for the duration (a mid-search file replacement racing a
  // delete could leave things in a confusing state) and Search for HQ
  // itself shows a "Searching…" label and can't be re-triggered.
  searching: boolean;
  onSearchHq: () => void;
}

// Long-press track menu — shared by every screen that renders TrackRow, so
// a track's menu looks and behaves identically wherever it's rendered.
// Mirrors frontend/src/components/TrackContextMenu.tsx. Rename is a
// disabled placeholder for now; Delete and Search for HQ are both wired up.
export function TrackContextMenu({ playlistId, video, position, onDismiss, onDeleted, searching, onSearchHq }: TrackContextMenuProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Already downloaded the HQ file, or already know a better one exists
  // (found but not auto-downloaded) — either way there's nothing a fresh
  // search would tell us that we don't already know.
  const alreadyHasHq = video.hqFileDownloaded || video.betterQualityExists;
  const searchHqLabel = searching
    ? 'playlists.videoList.searchingHq'
    : alreadyHasHq
    ? 'playlists.videoList.alreadyHasHq'
    : 'playlists.videoList.searchForHq';

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await playlistsApi.deleteTrack(playlistId, video.id);
      showToast(t('playlists.videoList.trackDeleted', { title: video.title }));
      onDeleted?.(video.id);
      setConfirming(false);
    } catch {
      showToast(t('playlists.videoList.trackDeleteError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Menu visible={Boolean(position)} onDismiss={onDismiss} anchor={position ?? { x: 0, y: 0 }}>
        <Menu.Item leadingIcon="pencil-outline" disabled title={t('playlists.videoList.renameTrack')} />
        <Menu.Item leadingIcon="delete-outline" disabled={searching} title={t('playlists.videoList.deleteTrack')}
          onPress={() => { onDismiss(); setConfirming(true); }} />
        <Menu.Item leadingIcon="quality-high" disabled={searching || alreadyHasHq || video.downloadStatus !== 'done'}
          title={t(searchHqLabel)}
          onPress={() => { onDismiss(); onSearchHq(); }} />
      </Menu>
      <ConfirmDialog
        visible={confirming}
        title={t('playlists.videoList.deleteTrackConfirm.title')}
        message={t('playlists.videoList.deleteTrackConfirm.message', { title: video.title })}
        confirmLabel={t('playlists.videoList.deleteTrack')}
        cancelLabel={t('common.cancel')}
        loading={deleting}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
