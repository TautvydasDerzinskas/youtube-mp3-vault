import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, Dialog, IconButton, List, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { CloseHqCandidate, PlaylistVideo } from '../api/playlists';
import { youtubeWatchUrl } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';

// Brand names — deliberately not run through i18n, same as web's own
// PROVIDER_LABEL in CloseHqCandidatesDialog.tsx. "Soulseek" (not "slskd",
// the daemon's own name) since that's the network name a user would
// actually recognize.
const PROVIDER_LABEL: Record<CloseHqCandidate['provider'], string> = {
  slskd: 'Soulseek',
  jiosaavn: 'JioSaavn',
  deezer: 'Deezer',
  qobuz: 'Qobuz',
  tidal: 'Tidal',
};

interface CloseHqCandidatesDialogProps {
  // Only the original-title/YouTube-link comparison row needs this — see
  // RenameTrackDialog's identical row, which this one is deliberately
  // styled to match.
  video: Pick<PlaylistVideo, 'youtubeId' | 'originalTitle' | 'title'>;
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
 * the providers it searches (Soulseek, JioSaavn, or a connected Deezer/
 * Qobuz/Tidal account) turned up real search results that just didn't clear
 * the match-confidence bar (see CloseHqCandidate's own doc comment on the
 * backend). Picking one asks for confirmation, then renames the track to
 * match it.
 */
export function CloseHqCandidatesDialog({ video, candidates, onDismiss, onSelect }: CloseHqCandidatesDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<CloseHqCandidate | null>(null);

  return (
    <Portal>
      <Dialog visible={candidates.length > 0 && !selected} onDismiss={onDismiss}>
        <Dialog.Title>{t('playlists.videoList.closeHqCandidates.title')}</Dialog.Title>
        <Dialog.Content style={styles.originalTitleContent}>
          <Banner visible icon="information-outline" style={styles.banner}>
            {t('playlists.videoList.closeHqCandidates.infoBox')}
          </Banner>
          <View style={styles.originalTitleRow}>
            <Text variant="bodySmall" style={styles.originalTitleText} numberOfLines={2}>
              {t('playlists.videoList.originalTitle')}: {video.originalTitle ?? video.title}
            </Text>
            <IconButton icon="youtube" size={20} onPress={() => Linking.openURL(youtubeWatchUrl(video.youtubeId))} />
          </View>
        </Dialog.Content>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            {candidates.map((c) => (
              <List.Item
                key={`${c.provider}-${c.artist}-${c.title}`}
                title={`${c.artist} - ${c.title}`}
                onPress={() => setSelected(c)}
                right={() => (
                  <View style={styles.chipWrap}>
                    <Chip compact>{PROVIDER_LABEL[c.provider]}</Chip>
                  </View>
                )}
              />
            ))}
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
  scrollArea: { paddingHorizontal: 0, maxHeight: 320 },
  chipWrap: { justifyContent: 'center' },
});
