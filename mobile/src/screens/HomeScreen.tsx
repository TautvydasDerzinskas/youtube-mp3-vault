import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

// Placeholder landing screen — just proves the login → persisted-session
// round trip works end to end. Playlist browsing/sync comes later.
export function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome back, {user?.displayName}.</Text>
      <Pressable style={styles.button} onPress={() => logout()}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16, backgroundColor: '#121212' },
  text: { fontSize: 18, color: '#fff' },
  button: { backgroundColor: '#90caf9', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  buttonText: { color: '#121212', fontSize: 16, fontWeight: '700' },
});
