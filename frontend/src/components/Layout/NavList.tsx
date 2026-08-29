import { useState } from 'react';
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Collapse, Divider, Menu, MenuItem, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavItem } from './useNavItems';
import theme from '../../theme';

interface NavListProps {
  items: NavItem[];
  // Called after navigating to a leaf item — MobileTopBar uses this to close
  // its accordion; Sidebar has no equivalent state, so it's optional.
  onNavigate?: () => void;
  // Icon-only rail mode (see Sidebar's collapse toggle) — a top-level item
  // with children can't show an indented inline list in a ~72px rail, so it
  // opens a flyout Menu of its children instead (see flyoutAnchor below).
  collapsed?: boolean;
}

// Derived from the theme's own primary color (not a separately-hardcoded
// literal) so a future accent color change needs no edit here.
const selectedSx = {
  '&.Mui-selected': {
    backgroundColor: alpha(theme.palette.primary.main, 0.12),
    '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.18) },
  },
};

export function NavList({ items, onNavigate, collapsed = false }: NavListProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => new Set());
  const [flyout, setFlyout] = useState<{ anchorEl: HTMLElement; item: NavItem } | null>(null);

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

  const closeFlyout = () => setFlyout(null);

  const renderItem = (item: NavItem, depth: number) => {
    const hasChildren = !!item.children?.length;
    const withinRoute = location.pathname.startsWith(item.path);
    const active = !hasChildren && withinRoute;
    const isOpen = openPaths.has(item.path) || (hasChildren && withinRoute);

    if (collapsed && depth === 0) {
      const highlighted = active || (hasChildren && withinRoute);
      return (
        <Box key={item.path}>
          {item.dividerBefore && <Divider sx={{ my: 1, borderColor: 'divider' }} />}
          <Tooltip title={item.label} placement="right">
            <ListItemButton
              selected={highlighted}
              onClick={(e) => (hasChildren ? setFlyout({ anchorEl: e.currentTarget, item }) : go(item.path))}
              sx={{ borderRadius: 2, mb: 0.5, px: 0, justifyContent: 'center', ...selectedSx }}
            >
              <ListItemIcon sx={{ minWidth: 0, color: highlighted ? 'primary.main' : 'text.secondary' }}>
                {item.icon}
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        </Box>
      );
    }

    return (
      <Box key={item.path}>
        {item.dividerBefore && <Divider sx={{ my: 1, borderColor: 'divider' }} />}
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

  return (
    <>
      <List disablePadding>{items.map((item) => renderItem(item, 0))}</List>
      <Menu
        anchorEl={flyout?.anchorEl ?? null}
        open={Boolean(flyout)}
        onClose={closeFlyout}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {flyout?.item.children?.map((child) => (
          <MenuItem
            key={child.path}
            selected={location.pathname.startsWith(child.path)}
            onClick={() => { closeFlyout(); go(child.path); }}
          >
            <ListItemIcon sx={{ minWidth: 32, color: location.pathname.startsWith(child.path) ? 'primary.main' : 'text.secondary' }}>
              {child.icon}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }}>{child.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
