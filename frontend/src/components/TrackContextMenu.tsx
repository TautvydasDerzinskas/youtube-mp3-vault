import { useState } from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { Edit as EditIcon, DeleteOutline as DeleteIcon, HighQuality as ScanHqIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/youtube';
import { useToast } from '../contexts/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { RenameTrackDialog } from './RenameTrackDialog';

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

// Right-click track menu — shared by every list that renders TrackRow (see
// that component's own doc comment for why there's only one of it) so a
// track's menu looks and behaves identically everywhere it's rendered.
export function TrackContextMenu({ playlistId, video, position, onClose, onDeleted, searching, onSearchHq, onRename }: TrackContextMenuProps) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();
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
  // automatic passes hasn't already resolved this track — once MusicBrainz
  // has matched it *and* an HQ version has been found, a better name can't
  // change either outcome (see renameTrack in the backend's
  // slskdQualityWorker.ts, which independently re-runs only the piece(s)
  // still missing after a rename for exactly this reason). Unlike Search
  // for HQ above, a found-but-undownloaded match still counts as "resolved"
  // here — a rename wouldn't do anything a manual re-search couldn't.
  const alreadyHasHq = video.hqFileDownloaded || video.betterQualityExists;
  const hasMetadata = video.metadataStatus === 'found';
  const canRename = !hasMetadata || !alreadyHasHq;

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
        <MenuItem disabled={searching || !canRename} onClick={() => { onClose(); setRenaming(true); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('playlists.videoList.renameTrack')}</ListItemText>
        </MenuItem>
        <MenuItem disabled={searching} sx={{ color: 'error.main' }} onClick={() => { onClose(); setConfirming(true); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>{t('playlists.videoList.deleteTrack')}</ListItemText>
        </MenuItem>
        <MenuItem disabled={searching || hqDownloaded || video.downloadStatus !== 'done'} onClick={() => { onClose(); onSearchHq(); }}>
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
      {renaming && (
        <RenameTrackDialog
          playlistId={playlistId}
          video={video}
          open={renaming}
          onClose={() => setRenaming(false)}
          onRename={onRename}
        />
      )}
    </>
  );
}
