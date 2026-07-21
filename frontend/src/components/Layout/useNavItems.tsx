import { ReactElement } from 'react';
import {
  QueueMusic as PlaylistsIcon,
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
}

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
        { label: t('nav.triggers'), path: '/admin/triggers', icon: <TriggersIcon /> },
        { label: t('nav.logs'), path: '/admin/logs', icon: <LogsIcon /> },
        { label: t('nav.settings'), path: '/admin/settings', icon: <SettingsIcon /> },
      ],
    }] : []),
    { label: t('nav.downloads'), path: '/downloads', icon: <DownloadsIcon /> },
  ];
}
