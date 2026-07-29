import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

// Placeholder — genre browsing comes later.
export function GenresScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text variant="titleMedium">{t('nav.genres')}</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>{t('common.comingSoon')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 8 },
  subtitle: { opacity: 0.7 },
});
