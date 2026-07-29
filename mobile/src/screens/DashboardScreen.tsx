import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';

// Placeholder — proves the login → persisted-session round trip works end
// to end. Real dashboard content (stat panes, top songs/artists/genres,
// mirroring frontend/src/pages/DashboardPage) comes later.
export function DashboardScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.text}>Welcome back, {user?.displayName}.</Text>
      <Button mode="outlined" onPress={() => logout()}>
        Log out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  text: { marginBottom: 8 },
});
