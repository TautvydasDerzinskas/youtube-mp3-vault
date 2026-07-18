import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Typography,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  QueueMusic as PlaylistsIcon,
  Logout as LogoutIcon,
  MusicNote as MusicNoteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  width: number;
}

export default function Sidebar({ width }: SidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [{ label: t('nav.playlists'), path: '/playlists', icon: <PlaylistsIcon /> }];

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await logout();
    navigate('/login');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Logo */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <MusicNoteIcon sx={{ color: 'primary.main', fontSize: 28 }} />
        <Typography variant="h6" fontWeight={700} color="primary.main">
          {t('auth.appName')}
        </Typography>
      </Box>

      <Divider sx={{ borderColor: '#2a2a2a' }} />

      {/* Navigation */}
      <List sx={{ flexGrow: 1, pt: 1, px: 1 }}>
        {navItems.map(({ label, path, icon }) => {
          const active = location.pathname.startsWith(path);
          return (
            <ListItemButton
              key={path}
              selected={active}
              onClick={() => navigate(path)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255, 0, 0, 0.12)',
                  '&:hover': { backgroundColor: 'rgba(255, 0, 0, 0.18)' },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: active ? 'primary.main' : 'text.secondary',
                }}
              >
                {icon}
              </ListItemIcon>
              <ListItemText
                primary={label}
                primaryTypographyProps={{
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'primary.main' : 'text.primary',
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Divider sx={{ borderColor: '#2a2a2a' }} />

      {/* User strip — click to open profile */}
      <Box
        onClick={() => navigate('/profile')}
        sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.04)' } }}
      >
        <Avatar
          alt={user?.displayName}
          sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}
        >
          {user?.displayName?.[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {user?.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {user?.email}
          </Typography>
        </Box>
        <Tooltip title={t('nav.logout')}>
          <IconButton size="small" onClick={handleLogout} sx={{ color: 'text.secondary' }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
}
