import { useState } from 'react';
import { Avatar, Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { Person as PersonIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGravatarUrl } from '../../hooks/useGravatarUrl';

interface ServiceBadgeDef {
  key: 'lastfm' | 'deezer' | 'qobuz' | 'tidal';
  label: string;
  color: string;
  // Only Tidal's brand is monochrome (black/white) — its "connected" pill
  // would otherwise be indistinguishable from the disconnected gray, so it
  // gets a white border the others don't need.
  borderColor?: string;
  tab: 'lastfm' | 'hq';
}

const SERVICE_BADGES: ServiceBadgeDef[] = [
  { key: 'lastfm', label: 'Last.fm', color: '#d51007', tab: 'lastfm' },
  { key: 'deezer', label: 'Deezer', color: '#a238ff', tab: 'hq' },
  { key: 'qobuz', label: 'Qobuz', color: '#4f1d8c', tab: 'hq' },
  { key: 'tidal', label: 'Tidal', color: '#000000', borderColor: '#ffffff', tab: 'hq' },
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
export function UserMenu({ avatarSize = 36 }: UserMenuProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const avatarUrl = useGravatarUrl(user?.email, 128);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const closeMenu = () => setAnchorEl(null);
  const goToTab = (tab: string) => {
    closeMenu();
    navigate(`/profile?tab=${tab}`);
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
        <MenuItem onClick={() => goToTab('profile')}>
          <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('profile.tabProfile')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => goToTab('settings')}>
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('profile.tabSettings')}</ListItemText>
        </MenuItem>
        <Divider />
        <Box sx={{ px: 2, py: 1.25, display: 'flex', gap: 0.75 }}>
          {SERVICE_BADGES.map(svc => (
            <Box
              key={svc.key}
              onClick={() => goToTab(svc.tab)}
              sx={{
                px: 1, py: 0.375, borderRadius: 1, fontSize: 11, fontWeight: 600, lineHeight: 1.4,
                cursor: 'pointer', whiteSpace: 'nowrap', color: '#fff',
                backgroundColor: connected[svc.key] ? svc.color : '#151212',
                opacity: connected[svc.key] ? 1 : 0.6,
                border: svc.borderColor && connected[svc.key] ? `1px solid ${svc.borderColor}` : 'none',
              }}
            >
              {svc.label}
            </Box>
          ))}
        </Box>
      </Menu>
    </>
  );
}
