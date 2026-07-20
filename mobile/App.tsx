import { useState, useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, PaperProvider, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from './src/theme';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ServerConfigProvider, useServerConfig } from './src/contexts/ServerConfigContext';
import { useUpdateCheck } from './src/hooks/useUpdateCheck';
import { registerToastListener } from './src/utils/toast';
import { ServerSetupScreen } from './src/screens/ServerSetupScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';

function AuthGate() {
  const { user, loading } = useAuth();
  const { available, releaseUrl } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!available) setDismissed(false);
  }, [available]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <>
      {user ? <HomeScreen /> : <LoginScreen />}
      <Snackbar
        visible={available && !dismissed}
        onDismiss={() => setDismissed(true)}
        action={releaseUrl ? { label: 'View', onPress: () => Linking.openURL(releaseUrl) } : undefined}
      >
        A newer version of YoutubeVault is available.
      </Snackbar>
    </>
  );
}

function Root() {
  const { serverUrl, loading } = useServerConfig();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    registerToastListener(setToastMessage);
    return () => registerToastListener(null);
  }, []);

  return (
    <View style={styles.appBackground}>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : serverUrl ? (
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      ) : (
        <ServerSetupScreen />
      )}
      <Snackbar visible={toastMessage != null} onDismiss={() => setToastMessage(null)} duration={4000}>
        {toastMessage}
      </Snackbar>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <ServerConfigProvider>
          <Root />
        </ServerConfigProvider>
        <StatusBar style="light" />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appBackground: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
