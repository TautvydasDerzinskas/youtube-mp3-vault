import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';

// Placeholder — real dashboard content (stat panes, top songs/artists/
// genres, mirroring frontend/src/pages/DashboardPage) comes later.
export function DashboardScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text variant="titleMedium">Welcome back, {user?.displayName}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
