import { ReactElement } from 'react';
import {
  Dashboard as DashboardIcon,
  QueueMusic as PlaylistsIcon,
  LocalOffer as GenresIcon,
  Group as UsersIcon,
  Android as DownloadsIcon,
  AdminPanelSettings as AdministrationIcon,
  Settings as SettingsIcon,
  Bolt as TriggersIcon,
  History as LogsIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

export interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
  children?: NavItem[];
  // Renders a divider above this item — used to set the Administration
  // group apart from the regular nav items above it.
  dividerBefore?: boolean;
}

export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const { user } = useAuth();

  return [
    { label: t('nav.dashboard'), path: '/dashboard', icon: <DashboardIcon /> },
    { label: t('nav.playlists'), path: '/playlists', icon: <PlaylistsIcon /> },
    { label: t('nav.genres'), path: '/genres', icon: <GenresIcon /> },
    { label: t('nav.downloads'), path: '/downloads', icon: <DownloadsIcon /> },
    // Kept last, set apart by its own divider — an admin-only section, not
    // part of the everyday nav items above it.
    ...(user?.isAdmin ? [{
      label: t('nav.administration'),
      path: '/admin',
      icon: <AdministrationIcon />,
      dividerBefore: true,
      children: [
        { label: t('nav.users'), path: '/admin/users', icon: <UsersIcon /> },
        { label: t('nav.triggers'), path: '/admin/triggers', icon: <TriggersIcon /> },
        { label: t('nav.logs'), path: '/admin/logs', icon: <LogsIcon /> },
        { label: t('nav.settings'), path: '/admin/settings', icon: <SettingsIcon /> },
      ],
    }] : []),
  ];
}
