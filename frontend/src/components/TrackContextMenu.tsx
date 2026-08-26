import { useState } from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { Edit as EditIcon, DeleteOutline as DeleteIcon, HighQuality as ScanHqIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { useToast } from '../contexts/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';

interface TrackContextMenuProps {
  playlistId: string;
  video: PlaylistVideo;
  // Screen coordinates from the row's onContextMenu event — null closes/hides
  // the menu. Position-anchored rather than element-anchored since the
  // trigger is a right-click anywhere on the row, not a fixed icon button.
  position: { top: number; left: number } | null;
  onClose: () => void;
  // Lets the caller drop this row from its own local list immediately
  // instead of waiting for a refetch — optional since some TrackRow call
  // sites (e.g. Similar Songs) don't hold mutable list state to update.
  onDeleted?: (videoId: string) => void;
  // True while TrackRow's own "Search for HQ" poll loop is running — Delete
  // is disabled for the duration (a mid-search file replacement racing a
  // delete could leave things in a confusing state) and Search for HQ
  // itself shows a "Searching…" label and can't be re-triggered.
  searching: boolean;
  onSearchHq: () => void;
}

// Right-click track menu — shared by every list that renders TrackRow (see
// that component's own doc comment for why there's only one of it) so a
// track's menu looks and behaves identically everywhere it's rendered.
// Rename is a disabled placeholder for now; Delete and Search for HQ are
// both wired up.
export function TrackContextMenu({ playlistId, video, position, onClose, onDeleted, searching, onSearchHq }: TrackContextMenuProps) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();
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
      showSuccess(t('playlists.videoList.trackDeleted', { title: video.title }));
      onDeleted?.(video.id);
      setConfirming(false);
    } catch (err: any) {
      showError(err.response?.data?.error ?? t('playlists.videoList.trackDeleteError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Menu
        open={Boolean(position)}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={position ?? undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem disabled>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('playlists.videoList.renameTrack')}</ListItemText>
        </MenuItem>
        <MenuItem disabled={searching} sx={{ color: 'error.main' }} onClick={() => { onClose(); setConfirming(true); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>{t('playlists.videoList.deleteTrack')}</ListItemText>
        </MenuItem>
        <MenuItem disabled={searching || alreadyHasHq || video.downloadStatus !== 'done'} onClick={() => { onClose(); onSearchHq(); }}>
          <ListItemIcon><ScanHqIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t(searchHqLabel)}</ListItemText>
        </MenuItem>
      </Menu>
      {confirming && (
        <ConfirmDialog
          title={t('playlists.videoList.deleteTrackConfirm.title')}
          message={t('playlists.videoList.deleteTrackConfirm.message', { title: video.title })}
          confirmLabel={t('playlists.videoList.deleteTrack')}
          destructive
          loading={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
