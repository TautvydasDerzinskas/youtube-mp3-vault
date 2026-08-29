import {
  Box,
  Drawer,
  Typography,
  Divider,
} from '@mui/material';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SidebarAudioGlow } from './SidebarAudioGlow';
import { useNavItems } from './useNavItems';
import { NavList } from './NavList';

interface SidebarProps {
  width: number;
}

export default function Sidebar({ width }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navItems = useNavItems();

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
      <Box
        onClick={() => navigate('/dashboard')}
        sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1, position: 'relative', overflow: 'hidden',
          cursor: 'pointer' }}
      >
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
    </Drawer>
  );
}
