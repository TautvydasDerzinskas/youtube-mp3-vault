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
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Logout as LogoutIcon,
  MusicNote as MusicNoteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '../../hooks/useLogout';
import { useNavItems } from './useNavItems';
import { NavList } from './NavList';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { MOBILE_TOPBAR_HEIGHT } from './constants';

export default function MobileTopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useNavItems();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    setOpen(false);
    logout();
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
        <Box
          onClick={() => handleNavigate('/dashboard')}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, cursor: 'pointer' }}
        >
          <MusicNoteIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700} color="primary.main">
            {t('auth.appName')}
          </Typography>
        </Box>
        <NotificationBell />
        <UserMenu avatarSize={32} />
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
