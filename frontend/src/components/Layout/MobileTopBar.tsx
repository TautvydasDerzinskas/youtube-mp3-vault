import { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Avatar,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Logout as LogoutIcon,
  MusicNote as MusicNoteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNavItems } from './useNavItems';
import { NavList } from './NavList';
import { MOBILE_TOPBAR_HEIGHT } from './constants';

// Small-screen substitute for the permanent Sidebar (see AppLayout) — a
// fixed top bar whose hamburger button expands the same nav items as an
// accordion overlaying the page below, instead of a fixed-width drawer
// squeezing the content sideways.
export default function MobileTopBar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = useNavItems();
  const [open, setOpen] = useState(false);

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <AppBar position="fixed" elevation={2} sx={{ backgroundColor: '#161616', backgroundImage: 'none' }}>
      <Toolbar sx={{ minHeight: MOBILE_TOPBAR_HEIGHT, gap: 1 }}>
        <IconButton
          edge="start"
          color="inherit"
          aria-label={open ? t('nav.collapseMenu') : t('nav.expandMenu')}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </IconButton>
        <MusicNoteIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700} color="primary.main" sx={{ flexGrow: 1 }}>
          {t('auth.appName')}
        </Typography>
        <Avatar
          alt={user?.displayName}
          onClick={() => handleNavigate('/profile')}
          sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13, cursor: 'pointer' }}
        >
          {user?.displayName?.[0]?.toUpperCase()}
        </Avatar>
      </Toolbar>

      <Collapse in={open}>
        <Box sx={{ px: 1, pb: 1 }}>
          <NavList items={navItems} onNavigate={() => setOpen(false)} />

          <Divider sx={{ my: 1, borderColor: '#2a2a2a' }} />

          <List disablePadding>
            <ListItemButton onClick={handleLogout} sx={{ borderRadius: 2 }}>
              <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary={t('nav.logout')} primaryTypographyProps={{ fontSize: 14 }} />
            </ListItemButton>
          </List>
        </Box>
      </Collapse>
    </AppBar>
  );
}
