import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { PasswordInput } from '../components/PasswordInput';

// Mirrors web's ChangeEmailPage.tsx — pushed from ProfileTabContent's
// "Change email" button, same as web's separate /profile/email route.
export function ChangeEmailScreen() {
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await updateProfile({ currentPassword: password, email: email.trim() });
      setPassword('');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('profile.genericError'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {user?.pendingEmail && (
          <Text variant="bodySmall" style={styles.pendingNotice}>
            {t('profile.pendingEmailNotice', { email: user.pendingEmail })}
          </Text>
        )}

        <TextInput
          mode="outlined"
          label={t('profile.email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <PasswordInput label={t('profile.currentPassword')} value={password} onChangeText={setPassword} style={styles.input} />
        <HelperText type="error" visible={error != null}>{error}</HelperText>

        <Button mode="contained" onPress={handleSubmit} loading={loading} disabled={!canSubmit}>
          {t('profile.saveEmail')}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 4 },
  input: { marginBottom: 4 },
  pendingNotice: { marginBottom: 16 },
});
