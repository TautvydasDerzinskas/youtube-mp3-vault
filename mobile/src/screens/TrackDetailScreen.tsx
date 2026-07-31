import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useTrackDetail } from './trackDetail/useTrackDetail';
import { TrackDetailHeader } from './trackDetail/TrackDetailHeader';
import { RecommendedTracks } from './trackDetail/RecommendedTracks';

type TrackDetailRouteProp = RouteProp<RootStackParamList, 'TrackDetail'>;

// Mirrors frontend/src/pages/TrackDetailPage/index.tsx — Header +
// RecommendedTracks only for this pass (Discover/Remixes/UsedIn deferred).
export function TrackDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<TrackDetailRouteProp>();
  const { playlistId, trackId } = route.params;
  const { video, recommendations } = useTrackDetail(playlistId, trackId);

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
    <ScrollView style={{ backgroundColor: theme.colors.background }}>
      <TrackDetailHeader video={video} playlistId={playlistId} />
      {Array.isArray(recommendations) && <RecommendedTracks recommendations={recommendations} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
