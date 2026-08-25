import { StyleSheet, View } from 'react-native';
import { Divider } from 'react-native-paper';
import { DeezerTabContent } from './DeezerTabContent';
import { QobuzTabContent } from './QobuzTabContent';
import { TidalTabContent } from './TidalTabContent';

// Hosts every per-user, opt-in-with-own-credentials HQ provider section —
// Deezer, Qobuz, and Tidal so far, built to hold more as they're added.
// Mirrors web's HqDownloadTab.tsx — see it for the full rationale.
interface HqDownloadTabContentProps {
  allowedProviders: string[];
}

export function HqDownloadTabContent({ allowedProviders }: HqDownloadTabContentProps) {
  const showDeezer = allowedProviders.includes('deezer');
  const showQobuz = allowedProviders.includes('qobuz');
  const showTidal = allowedProviders.includes('tidal');
  return (
    <View>
      {showDeezer && <DeezerTabContent />}
      {showDeezer && (showQobuz || showTidal) && <Divider style={styles.divider} />}
      {showQobuz && <QobuzTabContent />}
      {showQobuz && showTidal && <Divider style={styles.divider} />}
      {showTidal && <TidalTabContent />}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { marginBottom: 16 },
});
