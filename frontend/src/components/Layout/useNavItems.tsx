import { ReactElement } from 'react';
import {
  QueueMusic as PlaylistsIcon,
  Group as UsersIcon,
  Android as DownloadsIcon,
  AdminPanelSettings as AdministrationIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

export interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
  children?: NavItem[];
}

// Shared by Sidebar (desktop) and MobileTopBar (small screens) — via the
// shared NavList component that renders this — so the two stay in sync
// automatically instead of duplicating this list.
export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const { user } = useAuth();

  return [
    { label: t('nav.playlists'), path: '/playlists', icon: <PlaylistsIcon /> },
    ...(user?.isAdmin ? [{
      label: t('nav.administration'),
      path: '/admin',
      icon: <AdministrationIcon />,
      children: [
        { label: t('nav.users'), path: '/admin/users', icon: <UsersIcon /> },
        { label: t('nav.settings'), path: '/admin/settings', icon: <SettingsIcon /> },
      ],
    }] : []),
    { label: t('nav.downloads'), path: '/downloads', icon: <DownloadsIcon /> },
  ];
}
