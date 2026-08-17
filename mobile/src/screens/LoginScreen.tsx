import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { PasswordInput } from '../components/PasswordInput';

export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      // No response at all (network error/timeout — see api/client.ts's
      // default timeout) means the request never reached the server, so
      // "check your credentials" would be actively misleading — most
      // commonly this is the phone having no route to the configured
      // server at all, not a rejected login.
      setError(err?.response ? (err.response.data?.error ?? t('auth.signInFailed')) : t('auth.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text variant="headlineMedium" style={styles.title}>{t('auth.appName')}</Text>

        <TextInput
          mode="outlined"
          label={t('auth.email')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <PasswordInput label={t('auth.password')} value={password} onChangeText={setPassword} style={styles.input} />
        <HelperText type="error" visible={error != null}>
          {error}
        </HelperText>

        <Button mode="contained" onPress={handleSubmit} loading={loading} disabled={!canSubmit}>
          {t('auth.signIn')}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { textAlign: 'center', marginBottom: 24 },
  input: { marginBottom: 4 },
});
