import { Box, TextField, Button, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface RegisterFormProps {
  name: string;
  email: string;
  password: string;
  confirm: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function RegisterForm({
  name, email, password, confirm,
  onNameChange, onEmailChange, onPasswordChange, onConfirmChange,
  loading, onSubmit,
}: RegisterFormProps) {
  const { t } = useTranslation();
  return (
    <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        label={t('auth.displayName')}
        value={name}
        onChange={e => onNameChange(e.target.value)}
        required
        fullWidth
        autoComplete="name"
        autoFocus
      />
      <TextField
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={e => onEmailChange(e.target.value)}
        required
        fullWidth
        autoComplete="email"
      />
      <TextField
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={e => onPasswordChange(e.target.value)}
        required
        fullWidth
        autoComplete="new-password"
        helperText={t('auth.passwordHelper')}
      />
      <TextField
        label={t('auth.confirmPassword')}
        type="password"
        value={confirm}
        onChange={e => onConfirmChange(e.target.value)}
        required
        fullWidth
        autoComplete="new-password"
      />
      <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
        {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.createAccount')}
      </Button>
    </Box>
  );
}
