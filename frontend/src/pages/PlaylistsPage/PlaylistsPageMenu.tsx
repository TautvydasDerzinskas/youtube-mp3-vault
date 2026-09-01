import { useState } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { MoreHoriz as MoreHorizIcon, Add as AddIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface PlaylistsPageMenuProps {
  onImport: () => void;
}

// "..." menu next to the Playlists page title (rendered in TopBar via
// usePageActions on desktop, inline next to the page's own heading on
// mobile) — replaces what used to be a full-width "Add Playlist" button.
export function PlaylistsPageMenu({ onImport }: PlaylistsPageMenuProps) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)} aria-label={t('playlists.moreActions')}>
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setAnchorEl(null); onImport(); }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('playlists.importPlaylists')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
