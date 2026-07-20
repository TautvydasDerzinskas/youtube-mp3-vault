import { ReactElement } from 'react';
import {
  QueueMusic as PlaylistsIcon,
  Group as UsersIcon,
  Android as DownloadsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

export interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
}

// Shared by Sidebar (desktop) and MobileTopBar (small screens) so the two
// stay in sync automatically instead of duplicating this list.
export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const { user } = useAuth();

  return [
    { label: t('nav.playlists'), path: '/playlists', icon: <PlaylistsIcon /> },
    ...(user?.isAdmin ? [{ label: t('nav.users'), path: '/users', icon: <UsersIcon /> }] : []),
    { label: t('nav.downloads'), path: '/downloads', icon: <DownloadsIcon /> },
  ];
}
