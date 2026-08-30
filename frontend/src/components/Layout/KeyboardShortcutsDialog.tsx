import { Box, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

// Mac shows the ⌘ glyph; every other platform shows "Ctrl" — matches which
// modifier PlayerContext's global keydown handler actually accepts (metaKey
// on Mac, ctrlKey elsewhere).
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? navigator.userAgent);
const MOD_KEY = isMac ? '⌘' : 'Ctrl';

function KeyCap({ children }: { children: string }) {
  return (
    <Box
      sx={{
        minWidth: 28, height: 28, px: 0.75, borderRadius: 1,
        bgcolor: 'action.selected', color: 'text.primary',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600, lineHeight: 1,
      }}
    >
      {children}
    </Box>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2">{label}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {keys.map((key, i) => <KeyCap key={i}>{key}</KeyCap>)}
      </Box>
    </Box>
  );
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation();

  const shortcuts: { label: string; keys: string[] }[] = [
    { label: t('profile.keyboard.playPause'), keys: ['Space'] },
    { label: t('profile.keyboard.shuffle'), keys: [MOD_KEY, 'S'] },
    { label: t('profile.keyboard.previous'), keys: [MOD_KEY, '←'] },
    { label: t('profile.keyboard.next'), keys: [MOD_KEY, '→'] },
    { label: t('profile.keyboard.volumeDown'), keys: [MOD_KEY, '↓'] },
    { label: t('profile.keyboard.volumeUp'), keys: [MOD_KEY, '↑'] },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('profile.keyboard.title')}
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 3 }}>
        {shortcuts.map(({ label, keys }) => <ShortcutRow key={label} label={label} keys={keys} />)}
      </DialogContent>
    </Dialog>
  );
}
