import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Alert } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { ProfileHeader } from './ProfileHeader';

export default function ChangeEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updateProfile({ currentPassword: password, email: email.trim() });
      setPassword('');
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('profile.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 480 }}>
      <ProfileHeader title={t('profile.changeEmailTitle')} onBack={() => navigate('/profile')} />

      {user?.pendingEmail && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('profile.pendingEmailNotice', { email: user.pendingEmail })}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField label={t('profile.email')} type="email" value={email}
          onChange={e => setEmail(e.target.value)} required fullWidth />
        <TextField label={t('profile.currentPassword')} type="password" value={password}
          onChange={e => setPassword(e.target.value)} required fullWidth />
        {error && <Alert severity="error">{error}</Alert>}
        <Button type="submit" variant="contained" disabled={loading} sx={{ alignSelf: 'flex-start' }}>
          {t('profile.saveEmail')}
        </Button>
      </Box>
    </Box>
  );
}
