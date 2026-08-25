import { StyleSheet, View } from 'react-native';
import { Divider } from 'react-native-paper';
import { DeezerTabContent } from './DeezerTabContent';
import { QobuzTabContent } from './QobuzTabContent';

// Hosts every per-user, opt-in-with-own-credentials HQ provider section —
// Deezer and Qobuz so far, built to hold more as they're added. Mirrors
// web's HqDownloadTab.tsx — see it for the full rationale.
interface HqDownloadTabContentProps {
  allowedProviders: string[];
}

export function HqDownloadTabContent({ allowedProviders }: HqDownloadTabContentProps) {
  const showDeezer = allowedProviders.includes('deezer');
  const showQobuz = allowedProviders.includes('qobuz');
  return (
    <View>
      {showDeezer && <DeezerTabContent />}
      {showDeezer && showQobuz && <Divider style={styles.divider} />}
      {showQobuz && <QobuzTabContent />}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { marginBottom: 16 },
});
