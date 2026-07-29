import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

// Placeholder — genre browsing comes later.
export function GenresScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium">Genres</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  subtitle: { opacity: 0.7 },
});
