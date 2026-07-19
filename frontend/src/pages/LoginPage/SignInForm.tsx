import { Box, TextField, Button, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface SignInFormProps {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onUseDemoAccount: () => void;
}

export function SignInForm({
  email, password, onEmailChange, onPasswordChange, loading, onSubmit, onUseDemoAccount,
}: SignInFormProps) {
  const { t } = useTranslation();
  return (
    <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        label={t('auth.email')}
        type="email"
        value={email}
        onChange={e => onEmailChange(e.target.value)}
        required
        fullWidth
        autoComplete="email"
        autoFocus
      />
      <TextField
        label={t('auth.password')}
        type="password"
        value={password}
        onChange={e => onPasswordChange(e.target.value)}
        required
        fullWidth
        autoComplete="current-password"
      />
      <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
        {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.signIn')}
      </Button>
      <Button variant="text" size="small" disabled={loading} onClick={onUseDemoAccount}>
        {t('auth.useDemoAccount')}
      </Button>
    </Box>
  );
}
