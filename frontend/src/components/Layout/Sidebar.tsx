import {
  Box,
  Drawer,
  Avatar,
  Typography,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Logout as LogoutIcon, MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useGravatarUrl } from '../../hooks/useGravatarUrl';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SidebarAudioGlow } from './SidebarAudioGlow';
import { useNavItems } from './useNavItems';
import { NavList } from './NavList';

interface SidebarProps {
  width: number;
}

export default function Sidebar({ width }: SidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const avatarUrl = useGravatarUrl(user?.email, 128);
  const navigate = useNavigate();
  const navItems = useNavItems();

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
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1, position: 'relative', overflow: 'hidden' }}>
        <SidebarAudioGlow />
        <MusicNoteIcon sx={{ color: 'primary.main', fontSize: 28, position: 'relative' }} />
        <Typography variant="h6" fontWeight={700} color="primary.main" sx={{ position: 'relative' }}>
          {t('auth.appName')}
        </Typography>
      </Box>

      <Divider sx={{ borderColor: '#2a2a2a' }} />

      {/* Navigation */}
      <Box sx={{ flexGrow: 1, pt: 1, px: 1, overflowY: 'auto' }}>
        <NavList items={navItems} />
      </Box>

      <Divider sx={{ borderColor: '#2a2a2a' }} />

      {/* User strip — click to open profile */}
      <Box
        onClick={() => navigate('/profile')}
        sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.04)' } }}
      >
        <Avatar
          alt={user?.displayName}
          src={avatarUrl}
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
