import { useState } from 'react';
import { Avatar, Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { Person as PersonIcon, Settings as SettingsIcon, Palette as PaletteIcon, Check as CheckIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useGravatarUrl } from '../../hooks/useGravatarUrl';

interface ServiceBadgeDef {
  key: 'lastfm' | 'deezer' | 'qobuz' | 'tidal';
  labelKey: string;
  color: string;
  // Only Tidal's brand is monochrome (black/white) — its "connected" pill
  // would otherwise be indistinguishable from the disconnected gray, so it
  // gets a white border the others don't need.
  borderColor?: string;
  tab: 'lastfm' | 'hq';
}

const SERVICE_BADGES: ServiceBadgeDef[] = [
  { key: 'lastfm', labelKey: 'profile.services.lastfm', color: '#d51007', tab: 'lastfm' },
  { key: 'deezer', labelKey: 'profile.services.deezer', color: '#a238ff', tab: 'hq' },
  { key: 'qobuz', labelKey: 'profile.services.qobuz', color: '#4f1d8c', tab: 'hq' },
  { key: 'tidal', labelKey: 'profile.services.tidal', color: '#000000', borderColor: '#ffffff', tab: 'hq' },
];

interface UserMenuProps {
  avatarSize?: number;
}

// Replaces the old sidebar "user strip" — an avatar (now top-right instead
// of bottom-of-sidebar) that opens a dropdown with identity, quick links
// into the Profile page's own tabs (see ProfilePage/index.tsx's `tab` query
// param), and at-a-glance connection status for every optional music
// service, each clickable straight to the tab that manages it. Logout stays
// reachable from the Profile page itself (see ProfileHeader.tsx) rather than
// living here too.
const THEME_MODES = ['light', 'dark'] as const;

export function UserMenu({ avatarSize = 36 }: UserMenuProps) {
  const { t } = useTranslation();
  const { user, updateTheme } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const avatarUrl = useGravatarUrl(user?.email, 128);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [themeAnchorEl, setThemeAnchorEl] = useState<HTMLElement | null>(null);
  const themeMode = user?.themeMode === 'dark' ? 'dark' : 'light';

  const closeMenu = () => setAnchorEl(null);
  const closeThemeMenu = () => setThemeAnchorEl(null);
  const goToTab = (tab: string) => {
    closeMenu();
    navigate(`/profile?tab=${tab}`);
  };

  const handleThemeSelect = async (mode: (typeof THEME_MODES)[number]) => {
    closeThemeMenu();
    closeMenu();
    if (mode === themeMode) return;
    try {
      await updateTheme(mode);
    } catch {
      showError(t('profile.genericError'));
    }
  };

  const connected: Record<ServiceBadgeDef['key'], boolean> = {
    lastfm: !!user?.lastfmUsername,
    deezer: !!user?.deezerConnected,
    qobuz: !!user?.qobuzConnected,
    tidal: !!user?.tidalConnected,
  };

  return (
    <>
      <IconButton onClick={e => setAnchorEl(e.currentTarget)} size="small">
        <Avatar
          alt={user?.displayName}
          src={avatarUrl}
          sx={{ width: avatarSize, height: avatarSize, bgcolor: 'primary.main', fontSize: avatarSize * 0.39 }}
        >
          {user?.displayName?.[0]?.toUpperCase()}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1.25, minWidth: 220 }}>
          <Typography variant="body2" fontWeight={600} noWrap>{user?.displayName}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{user?.email}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => goToTab('profile')} title={t('profile.tabProfile')}>
          <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('profile.tabProfile')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={(e) => setThemeAnchorEl(e.currentTarget)} title={t('profile.theme.label')}>
          <ListItemIcon><PaletteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('profile.theme.label')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => goToTab('settings')} title={t('profile.tabSettings')}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('profile.tabSettings')}</ListItemText>
        </MenuItem>
        <Divider />
        <Box sx={{ px: 2, py: 1.25, display: 'flex', gap: 0.75 }}>
          {SERVICE_BADGES.map(svc => (
            <Box
              key={svc.key}
              onClick={() => goToTab(svc.tab)}
              title={t(connected[svc.key] ? 'profile.services.connectionStatus.connected' : 'profile.services.connectionStatus.notConnected', { service: t(svc.labelKey) })}
              sx={{
                px: 1, py: 0.375, borderRadius: 1, fontSize: 11, fontWeight: 600, lineHeight: 1.4,
                cursor: 'pointer', whiteSpace: 'nowrap', color: '#fff',
                backgroundColor: connected[svc.key] ? svc.color : '#151212',
                opacity: connected[svc.key] ? 1 : 0.6,
                border: svc.borderColor && connected[svc.key] ? `1px solid ${svc.borderColor}` : 'none',
              }}
            >
              {t(svc.labelKey)}
            </Box>
          ))}
        </Box>
      </Menu>
      <Menu
        anchorEl={themeAnchorEl}
        open={Boolean(themeAnchorEl)}
        onClose={closeThemeMenu}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {THEME_MODES.map(mode => (
          <MenuItem key={mode} selected={themeMode === mode} onClick={() => handleThemeSelect(mode)}>
            <ListItemIcon>{themeMode === mode && <CheckIcon fontSize="small" />}</ListItemIcon>
            <ListItemText>{t(`profile.theme.${mode}`)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
