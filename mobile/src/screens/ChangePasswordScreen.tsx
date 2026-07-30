import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Button, HelperText } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { PasswordInput } from '../components/PasswordInput';

// Mirrors web's ChangePasswordPage.tsx — pushed from ProfileTabContent's
// "Change password" button, same as web's separate /profile/password route.
export function ChangePasswordScreen() {
  const { t } = useTranslation();
  const { updateProfile } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
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
      setError(err?.response?.data?.error ?? t('profile.genericError'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = currentPassword.length > 0 && newPassword.length > 0 && confirmNewPassword.length > 0 && !loading;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PasswordInput label={t('profile.currentPassword')} value={currentPassword} onChangeText={setCurrentPassword} style={styles.input} />
        <PasswordInput label={t('profile.newPassword')} value={newPassword} onChangeText={setNewPassword} style={styles.input} />
        <HelperText type="info" visible>{t('auth.passwordHelper')}</HelperText>
        <PasswordInput label={t('profile.confirmNewPassword')} value={confirmNewPassword} onChangeText={setConfirmNewPassword} style={styles.input} />

        <HelperText type="error" visible={error != null}>{error}</HelperText>
        <HelperText type="info" visible={success}>{t('profile.passwordUpdated')}</HelperText>

        <Button mode="contained" onPress={handleSubmit} loading={loading} disabled={!canSubmit}>
          {t('profile.savePassword')}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 4 },
  input: { marginBottom: 4 },
});
