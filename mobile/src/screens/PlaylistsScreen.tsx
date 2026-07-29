import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

// Placeholder — playlist browsing/sync comes later.
export function PlaylistsScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium">Playlists</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  subtitle: { opacity: 0.7 },
});
