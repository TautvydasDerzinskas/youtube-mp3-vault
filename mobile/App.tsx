import { useState, useEffect } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, PaperProvider, Snackbar } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from './src/theme';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { useUpdateCheck } from './src/hooks/useUpdateCheck';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';

function Root() {
  const { user, loading } = useAuth();
  const { available, releaseUrl } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);

  // Re-arm the banner if a check somehow flips from unavailable to
  // available later (e.g. a release publishes mid-session) rather than
  // permanently hiding it after one dismissal.
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

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <AuthProvider>
          <Root />
        </AuthProvider>
        <StatusBar style="light" />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
