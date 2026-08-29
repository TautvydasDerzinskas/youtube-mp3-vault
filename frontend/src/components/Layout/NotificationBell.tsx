import { useState } from 'react';
import { Badge, Box, Collapse, Divider, IconButton, Menu, Tooltip, Typography } from '@mui/material';
import { Notifications as NotificationsIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../../contexts/NotificationsContext';
import { SyncReportBody } from '../SyncReportBody';
import { timeAgo } from '../../pages/PlaylistsPage/utils';

const DROPDOWN_MAX_HEIGHT = 480;

// Bell icon next to UserMenu in the top-right — the app-wide counterpart to
// PlaylistsPage's live SyncReportModal (see NotificationsContext for how the
// two relate). Opening the dropdown immediately marks every report as seen
// (clearing the badge), but this component still snapshots which ones WERE
// unread at the moment it opened (visualUnreadIds) purely so the dropdown
// can keep showing the "new" highlight/ordering for the rest of this one
// open session, even though the server-side seenAt already flipped.
export function NotificationBell() {
  const { t } = useTranslation();
  const { reports, unreadCount, markAllSeen } = useNotifications();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [visualUnreadIds, setVisualUnreadIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setVisualUnreadIds(new Set(reports.filter((r) => !r.seenAt).map((r) => r.id)));
    setAnchorEl(e.currentTarget);
    markAllSeen();
  };
  const handleClose = () => {
    setAnchorEl(null);
    setExpandedId(null);
  };

  // Stable partition (unread first) — reports already arrive newest-first
  // from the API, so this keeps that order within each partition too.
  const sorted = [...reports].sort((a, b) => {
    const aUnread = visualUnreadIds.has(a.id) ? 0 : 1;
    const bUnread = visualUnreadIds.has(b.id) ? 0 : 1;
    return aUnread - bUnread;
  });

  return (
    <>
      <Tooltip title={t('nav.notifications')}>
        <IconButton onClick={handleOpen} size="small">
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: '90vw', maxHeight: DROPDOWN_MAX_HEIGHT } } }}
      >
        {sorted.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {t('notifications.empty')}
            </Typography>
          </Box>
        ) : (
          sorted.map((report, i) => (
            <Box key={report.id}>
              {i > 0 && <Divider />}
              <Box
                onClick={() => setExpandedId((prev) => (prev === report.id ? null : report.id))}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, cursor: 'pointer',
                  '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.04)' } }}
              >
                {visualUnreadIds.has(report.id) && (
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0 }} />
                )}
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="body2" fontWeight={visualUnreadIds.has(report.id) ? 600 : 400} noWrap>
                    {t(`playlists.syncReport.actionTitle.${report.actionType}`)} — {report.playlistName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {timeAgo(report.createdAt, t)}
                  </Typography>
                </Box>
              </Box>
              <Collapse in={expandedId === report.id}>
                <Box sx={{ px: 2, pb: 1.5 }}>
                  <SyncReportBody report={report} />
                </Box>
              </Collapse>
            </Box>
          ))
        )}
      </Menu>
    </>
  );
}
