import { useState } from 'react';
import { Menu } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/playlists';
import { ConfirmDialog } from './ConfirmDialog';
import { RenameTrackDialog } from './RenameTrackDialog';
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
  // True while TrackRow's own "Search for HQ"/"Rename track" poll loop is
  // running — Delete is disabled for the duration (a mid-operation file
  // replacement racing a delete could leave things in a confusing state)
  // and Search for HQ itself shows a "Searching…" label and can't be
  // re-triggered.
  searching: boolean;
  onSearchHq: () => void;
  // Kicks off the rename (POST + the row's own polling lifecycle) — see
  // RenameTrackDialog's own doc comment for why this only needs to resolve
  // once the initial request succeeds, not the full background follow-up.
  onRename: (artist: string | null, title: string) => Promise<void>;
}

// Long-press track menu — shared by every screen that renders TrackRow, so
// a track's menu looks and behaves identically wherever it's rendered.
// Mirrors frontend/src/components/TrackContextMenu.tsx.
export function TrackContextMenu({ playlistId, video, position, onDismiss, onDeleted, searching, onSearchHq, onRename }: TrackContextMenuProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // Search for HQ is only pointless once the file is actually downloaded —
  // "found but not downloaded" (betterQualityExists) means a past pass
  // matched something but couldn't deliver it (peer offline, a transfer
  // that timed out, ...), which is exactly the case a manual retry can
  // still help with, so that alone must never disable this action.
  const hqDownloaded = video.hqFileDownloaded;
  const searchHqLabel = searching
    ? 'playlists.videoList.searchingHq'
    : hqDownloaded
    ? 'playlists.videoList.alreadyHasHq'
    : 'playlists.videoList.searchForHq';

  // Renaming only has something to offer while at least one of the two
  // automatic passes hasn't already resolved this track — see the backend's
  // renameTrack (slskdQualityWorker.ts), which independently re-runs only
  // the piece(s) still missing after a rename for exactly this reason.
  // Unlike Search for HQ above, a found-but-undownloaded match still counts
  // as "resolved" here — a rename wouldn't do anything a manual re-search
  // couldn't.
  const alreadyHasHq = video.hqFileDownloaded || video.betterQualityExists;
  const hasMetadata = video.metadataStatus === 'found';
  const canRename = !hasMetadata || !alreadyHasHq;

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
        <Menu.Item leadingIcon="pencil-outline" disabled={searching || !canRename} title={t('playlists.videoList.renameTrack')}
          onPress={() => { onDismiss(); setRenaming(true); }} />
        <Menu.Item leadingIcon="delete-outline" disabled={searching} title={t('playlists.videoList.deleteTrack')}
          onPress={() => { onDismiss(); setConfirming(true); }} />
        <Menu.Item leadingIcon="quality-high" disabled={searching || hqDownloaded || video.downloadStatus !== 'done'}
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
      {renaming && (
        <RenameTrackDialog
          playlistId={playlistId}
          video={video}
          onDismiss={() => setRenaming(false)}
          onRename={onRename}
        />
      )}
    </>
  );
}
