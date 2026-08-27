import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, Dialog, IconButton, List, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { CloseHqCandidate, PlaylistVideo } from '../api/playlists';
import { youtubeWatchUrl, formatDuration } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';

// Brand names — deliberately not run through i18n, same as web's own
// PROVIDER_LABEL in CloseHqCandidatesDialog.tsx. "Soulseek" (not "slskd",
// the daemon's own name) since that's the network name a user would
// actually recognize. No JioSaavn entry — see CloseHqCandidate's own doc
// comment on the backend for why it's excluded from this list.
const PROVIDER_LABEL: Record<CloseHqCandidate['provider'], string> = {
  slskd: 'Soulseek',
  deezer: 'Deezer',
  qobuz: 'Qobuz',
  tidal: 'Tidal',
};

interface CloseHqCandidatesDialogProps {
  // Only the original-title/current-track/YouTube-link/duration comparison
  // rows need this — see RenameTrackDialog's identical original-title row,
  // which this one is deliberately styled to match. `artist` is needed
  // alongside `title` to build the "current track" comparison line below.
  video: Pick<PlaylistVideo, 'youtubeId' | 'originalTitle' | 'title' | 'artist' | 'duration'>;
  candidates: CloseHqCandidate[];
  onDismiss: () => void;
  // Renames the track to the picked candidate's artist/title (reusing the
  // row's own rename lifecycle — see TrackRow's handleRename) — the backend
  // then re-attempts the HQ search under the corrected name, same as any
  // other rename.
  onSelect: (artist: string, title: string) => void;
}

/**
 * Mirrors frontend/src/components/CloseHqCandidatesDialog.tsx — shown after
 * a manual "Search for HQ" comes up with no downloadable match, but one of
 * the providers it searches (Soulseek or a connected Deezer/Qobuz/Tidal
 * account) turned up real search results that just didn't clear the
 * match-confidence bar (see CloseHqCandidate's own doc comment on the
 * backend). Each candidate's own reported duration is shown alongside our
 * video's, right next to the original title, so a duration mismatch (the
 * most common reason a same-titled candidate isn't actually the same
 * recording) is visible at a glance. Picking one asks for confirmation,
 * then renames the track to match it.
 */
export function CloseHqCandidatesDialog({ video, candidates, onDismiss, onSelect }: CloseHqCandidatesDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CloseHqCandidate | null>(null);

  // A single shared player for every candidate's preview clip rather than
  // one per row — only one can ever be playing at a time, and reusing one
  // player means switching candidates just calls .replace() instead of
  // juggling N separate player instances. useAudioPlayer (not
  // createAudioPlayer) is deliberate here — this player is scoped to this
  // dialog alone, unlike PlayerContext's app-wide one, so it should be
  // released automatically on unmount rather than outlive this screen.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    if (status.didJustFinish) setPlayingKey(null);
  }, [status.didJustFinish]);

  const togglePreview = (key: string, url: string) => {
    if (playingKey === key) {
      player.pause();
      setPlayingKey(null);
      return;
    }
    player.replace(url);
    player.play();
    setPlayingKey(key);
  };

  // Original YouTube title vs. what the track is actually stored as right
  // now — these drift apart over time (a manual rename, or metadata
  // resolution cleaning up the raw upload title), and the candidates below
  // are matched against the CURRENT name, not the YouTube one, so showing
  // both when they've diverged is what actually explains why a given
  // candidate looked close enough to suggest.
  const originalLabel = video.originalTitle ?? video.title;
  const currentLabel = video.artist ? `${video.artist} - ${video.title}` : video.title;
  const currentDiffersFromOriginal = currentLabel.trim().toLowerCase() !== originalLabel.trim().toLowerCase();

  return (
    <Portal>
      <Dialog visible={candidates.length > 0 && !selected} onDismiss={onDismiss}>
        <Dialog.Title>{t('playlists.videoList.closeHqCandidates.title')}</Dialog.Title>
        <Dialog.Content style={styles.originalTitleContent}>
          <Banner visible icon="information-outline" style={styles.banner}>
            {t('playlists.videoList.closeHqCandidates.infoBox')}
          </Banner>
          <View style={styles.originalTitleRow}>
            <View style={styles.originalTitleText}>
              <Text variant="labelSmall">{t('playlists.videoList.originalTitle')}</Text>
              <Text variant="bodyMedium" numberOfLines={2}>
                {originalLabel}
                {video.duration ? ` (${formatDuration(video.duration)})` : ''}
              </Text>
            </View>
            <IconButton icon="youtube" size={20} onPress={() => Linking.openURL(youtubeWatchUrl(video.youtubeId))} />
          </View>
          {currentDiffersFromOriginal && (
            <View style={styles.currentTrackBlock}>
              <Text variant="labelSmall">{t('playlists.videoList.currentTrack')}</Text>
              <Text variant="bodyMedium" numberOfLines={2}>{currentLabel}</Text>
            </View>
          )}
        </Dialog.Content>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            {candidates.map((c) => {
              const key = `${c.provider}-${c.artist}-${c.title}`;
              const isPlaying = playingKey === key;
              return (
                <List.Item
                  key={key}
                  title={`${c.artist} - ${c.title}`}
                  description={c.durationSec ? formatDuration(c.durationSec) : undefined}
                  onPress={() => { player.pause(); setSelected(c); }}
                  left={c.previewUrl ? () => (
                    <IconButton
                      icon={isPlaying ? 'stop' : 'play'}
                      onPress={() => togglePreview(key, c.previewUrl!)}
                    />
                  ) : undefined}
                  right={() => (
                    <View style={styles.chipWrap}>
                      <Chip compact>{PROVIDER_LABEL[c.provider]}</Chip>
                    </View>
                  )}
                />
              );
            })}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common.close')}</Button>
        </Dialog.Actions>
      </Dialog>
      {selected && (
        <ConfirmDialog
          visible
          title={t('playlists.videoList.closeHqCandidates.confirmTitle')}
          message={t('playlists.videoList.closeHqCandidates.confirmMessage', { name: `${selected.artist} - ${selected.title}` })}
          confirmLabel={t('playlists.videoList.rename')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => { onSelect(selected.artist, selected.title); setSelected(null); }}
          onCancel={() => setSelected(null)}
        />
      )}
    </Portal>
  );
}

const styles = StyleSheet.create({
  originalTitleContent: { paddingBottom: 0 },
  banner: { marginHorizontal: -24, marginBottom: 8 },
  originalTitleRow: { flexDirection: 'row', alignItems: 'center' },
  originalTitleText: { flex: 1 },
  currentTrackBlock: { marginBottom: 8 },
  scrollArea: { paddingHorizontal: 0, maxHeight: 320 },
  chipWrap: { justifyContent: 'center' },
});
