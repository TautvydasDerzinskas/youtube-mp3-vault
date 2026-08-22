import { View } from 'react-native';
import { DeezerTabContent } from './DeezerTabContent';

// Hosts every per-user, opt-in-with-own-credentials HQ provider section —
// currently just Deezer, built to hold more as they're added. Mirrors web's
// HqDownloadTab.tsx — see it for the full rationale.
interface HqDownloadTabContentProps {
  allowedProviders: string[];
}

export function HqDownloadTabContent({ allowedProviders }: HqDownloadTabContentProps) {
  return (
    <View>
      {allowedProviders.includes('deezer') && <DeezerTabContent />}
    </View>
  );
}
