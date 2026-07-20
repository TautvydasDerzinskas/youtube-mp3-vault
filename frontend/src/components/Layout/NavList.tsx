import { useState } from 'react';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Collapse } from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavItem } from './useNavItems';

interface NavListProps {
  items: NavItem[];
  // Called after navigating to a leaf item — MobileTopBar uses this to close
  // its accordion; Sidebar has no equivalent state, so it's optional.
  onNavigate?: () => void;
}

const selectedSx = {
  '&.Mui-selected': {
    backgroundColor: 'rgba(255, 0, 0, 0.12)',
    '&:hover': { backgroundColor: 'rgba(255, 0, 0, 0.18)' },
  },
};

/**
 * Renders Sidebar's and MobileTopBar's nav items identically, including one
 * level of nesting (see the admin-only "Administration" item in
 * useNavItems.tsx) — a parent with children toggles its own Collapse instead
 * of navigating, auto-expanded whenever the current route is already inside
 * it.
 */
export function NavList({ items, onNavigate }: NavListProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => new Set());

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const toggle = (path: string) => {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const renderItem = (item: NavItem, depth: number) => {
    const hasChildren = !!item.children?.length;
    const withinRoute = location.pathname.startsWith(item.path);
    const active = !hasChildren && withinRoute;
    const isOpen = openPaths.has(item.path) || (hasChildren && withinRoute);

    return (
      <Box key={item.path}>
        <ListItemButton
          selected={active}
          onClick={() => (hasChildren ? toggle(item.path) : go(item.path))}
          sx={{ borderRadius: 2, mb: 0.5, pl: 2 + depth * 2, ...selectedSx }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'text.secondary' }}>
            {item.icon}
          </ListItemIcon>
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              color: active ? 'primary.main' : 'text.primary',
            }}
          />
          {hasChildren && (isOpen ? <ExpandLess sx={{ color: 'text.secondary' }} /> : <ExpandMore sx={{ color: 'text.secondary' }} />)}
        </ListItemButton>
        {hasChildren && (
          <Collapse in={isOpen}>
            <List disablePadding>
              {item.children!.map((child) => renderItem(child, depth + 1))}
            </List>
          </Collapse>
        )}
      </Box>
    );
  };

  return <List disablePadding>{items.map((item) => renderItem(item, 0))}</List>;
}
