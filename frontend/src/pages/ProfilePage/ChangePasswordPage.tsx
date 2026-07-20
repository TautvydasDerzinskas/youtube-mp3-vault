import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Alert } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { ProfileHeader } from './ProfileHeader';

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { updateProfile } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmNewPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      await updateProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('profile.genericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <ProfileHeader title={t('profile.changePassword')} onBack={() => navigate('/profile')} />

      <Box sx={{ maxWidth: 480 }}>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label={t('profile.currentPassword')} type="password" value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)} required fullWidth />
          <TextField label={t('profile.newPassword')} type="password" value={newPassword}
            onChange={e => setNewPassword(e.target.value)} required fullWidth helperText={t('auth.passwordHelper')} />
          <TextField label={t('profile.confirmNewPassword')} type="password" value={confirmNewPassword}
            onChange={e => setConfirmNewPassword(e.target.value)} required fullWidth />
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{t('profile.passwordUpdated')}</Alert>}
          <Button type="submit" variant="contained" disabled={loading} sx={{ alignSelf: 'flex-start' }}>
            {t('profile.savePassword')}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
