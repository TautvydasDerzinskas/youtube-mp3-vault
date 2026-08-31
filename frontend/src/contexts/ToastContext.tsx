import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface ToastMessage {
  key: number;
  message: string;
  severity: AlertColor;
}

interface ToastContextType {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const AUTO_HIDE_DURATION_MS = 4000;

let nextKey = 0;

// Queued one-at-a-time per MUI's own recommended pattern for consecutive
// Snackbars (https://mui.com/material-ui/react-snackbar/#consecutive-snackbars)
// — without this, firing two toasts in quick succession (e.g. a toggle's
// error immediately followed by a page navigation's own toast) would just
// clobber whichever was showing instead of both being seen.
export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [queue, setQueue] = useState<ToastMessage[]>([]);
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const [open, setOpen] = useState(false);

  const showToast = useCallback((message: string, severity: AlertColor) => {
    setQueue((prev) => [...prev, { key: nextKey++, message, severity }]);
  }, []);

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const showInfo = useCallback((message: string) => showToast(message, 'info'), [showToast]);

  // Only ever promotes the next queued item once `current` is null, i.e.
  // once the previous toast has fully exited (via handleExited below) —
  // deliberately does *not* cut a still-showing toast short just because
  // something else is already waiting behind it, so every toast gets its
  // full autoHideDuration on screen regardless of how many are queued.
  useEffect(() => {
    if (queue.length === 0 || current) return;
    setCurrent(queue[0]);
    setQueue((prev) => prev.slice(1));
    setOpen(true);
  }, [queue, current]);

  const handleClose = (_event?: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const handleExited = () => setCurrent(null);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showInfo }}>
      {children}
      <Snackbar
        key={current?.key}
        open={open}
        autoHideDuration={AUTO_HIDE_DURATION_MS}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ transition: { onExited: handleExited } }}
      >
        {current ? (
          <Alert
            onClose={handleClose}
            severity={current.severity}
            variant="filled"
            sx={current.severity === 'success' ? {
              // MUI's stock success green doesn't fit this app's black/gold
              // palette (see theme.ts) — a plain monochrome swap reads as
              // "confirmed" without clashing, and inverts with theme mode the
              // same way the rest of the app's palette does.
              width: '100%',
              bgcolor: theme.palette.mode === 'dark' ? 'common.white' : 'common.black',
              color: theme.palette.mode === 'dark' ? 'common.black' : 'common.white',
              '& .MuiAlert-icon, & .MuiAlert-action': { color: 'inherit' },
            } : { width: '100%' }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
