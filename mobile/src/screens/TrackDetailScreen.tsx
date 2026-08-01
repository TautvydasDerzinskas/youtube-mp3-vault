import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { useTrackDetail } from './trackDetail/useTrackDetail';
import { TrackDetailHeader } from './trackDetail/TrackDetailHeader';
import { RecommendedTracks } from './trackDetail/RecommendedTracks';
import { DiscoverTracks } from './trackDetail/DiscoverTracks';
import { RemixLinks } from './trackDetail/RemixLinks';

type TrackDetailRouteProp = RouteProp<RootStackParamList, 'TrackDetail'>;

// Mirrors frontend/src/pages/TrackDetailPage/index.tsx — Header (which now
// includes the "appears in" usedIn row itself, same as web's Header.tsx),
// RecommendedTracks, DiscoverTracks, RemixLinks.
export function TrackDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<TrackDetailRouteProp>();
  const insets = useSafeAreaInsets();
  const { playlistId, trackId } = route.params;
  const { video, recommendations, discover, remixes, usedIn } = useTrackDetail(playlistId, trackId);

  useEffect(() => {
    if (video !== 'loading' && video !== 'error') {
      navigation.setOptions({ title: video.title });
    }
  }, [navigation, video]);

  if (video === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (video === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('playlists.trackDetail.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <TrackDetailHeader video={video} playlistId={playlistId} usedIn={usedIn} />
      {Array.isArray(recommendations) && <RecommendedTracks recommendations={recommendations} />}
      <DiscoverTracks state={discover} />
      <RemixLinks state={remixes} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
