import { useState } from 'react';
import {
  Box,
  Drawer,
  Typography,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import { MusicNote as MusicNoteIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SidebarAudioGlow } from './SidebarAudioGlow';
import { useNavItems } from './useNavItems';
import { NavList } from './NavList';
import { SIDEBAR_COLLAPSED_WIDTH } from './constants';

interface SidebarProps {
  width: number;
}

export default function Sidebar({ width }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useNavItems();
  const [collapsed, setCollapsed] = useState(false);
  const currentWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shortest }),
        '& .MuiDrawer-paper': {
          width: currentWidth,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflowX: 'hidden',
          transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.shortest }),
        },
      }}
    >
      {/* Logo + collapse toggle */}
      <Box
        sx={{ pl: 2.5, pr: 1, py: 2.5, display: 'flex', alignItems: 'center', position: 'relative',
          justifyContent: collapsed ? 'center' : 'space-between' }}
      >
        {!collapsed && (
          <Box
            onClick={() => navigate('/dashboard')}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, overflow: 'hidden',
              position: 'relative', cursor: 'pointer' }}
          >
            <SidebarAudioGlow />
            <MusicNoteIcon sx={{ color: 'primary.main', fontSize: 26, position: 'relative', flexShrink: 0 }} />
            <Typography variant="subtitle1" fontWeight={900} color="primary.main" noWrap
              sx={{ position: 'relative', fontFamily: '"Aftika", "Inter", "Arial", sans-serif' }}>
              {t('auth.appName')}
            </Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}>
          <IconButton size="small" onClick={() => setCollapsed((v) => !v)} sx={{ flexShrink: 0 }}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ borderColor: 'divider' }} />

      {/* Navigation */}
      <Box sx={{ flexGrow: 1, pt: 1, px: collapsed ? 0.5 : 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <NavList items={navItems} collapsed={collapsed} />
      </Box>
    </Drawer>
  );
}
