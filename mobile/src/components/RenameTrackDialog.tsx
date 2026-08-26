import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Banner, Button, Dialog, HelperText, IconButton, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { playlistsApi, PlaylistVideo } from '../api/playlists';
import { youtubeWatchUrl } from '../utils/format';

interface SuggestedName {
  artist: string | null;
  title: string;
}

interface RenameTrackDialogProps {
  playlistId: string;
  video: PlaylistVideo;
  onDismiss: () => void;
  // Kicks off the actual rename (POST + the row's own polling lifecycle,
  // same as Search for HQ) — this dialog only awaits it long enough to know
  // whether the initial request succeeded, not the full background
  // metadata/HQ-search follow-up, so it can dismiss right away and let the
  // row itself carry the rest of the "in progress" indicator.
  onRename: (artist: string | null, title: string) => Promise<void>;
}

/**
 * The "Rename track" modal — mirrors frontend/src/components/RenameTrackDialog.tsx.
 * Lets the user correct a badly auto-parsed artist/title, since good naming
 * is what both MusicBrainz matching and the HQ provider search actually key
 * off. Shows the original YouTube title (with a link out) for reference, a
 * locally-derived suggested artist/title when it differs from what's
 * currently stored, and editable fields prefilled with the current values.
 */
export function RenameTrackDialog({ playlistId, video, onDismiss, onRename }: RenameTrackDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [artist, setArtist] = useState(video.artist ?? '');
  const [title, setTitle] = useState(video.title);
  const [suggested, setSuggested] = useState<SuggestedName | 'loading' | 'error'>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    playlistsApi.getSuggestedName(playlistId, video.id).then(setSuggested).catch(() => setSuggested('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suggestedResult = suggested !== 'loading' && suggested !== 'error' ? suggested : null;
  // Only worth showing if it'd actually change something.
  const hasSuggestion = suggestedResult !== null
    && (suggestedResult.artist !== video.artist || suggestedResult.title !== video.title);
  const suggestedMatchesInputs = suggestedResult !== null
    && (suggestedResult.artist ?? '') === artist.trim() && suggestedResult.title === title.trim();

  const handleUseSuggested = () => {
    if (!suggestedResult) return;
    setArtist(suggestedResult.artist ?? '');
    setTitle(suggestedResult.title);
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSubmitting(true);
    setError(null);
    try {
      await onRename(artist.trim() || null, trimmedTitle);
      onDismiss();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('playlists.videoList.renameError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={submitting ? undefined : onDismiss}>
        <Dialog.Title>{t('playlists.videoList.renameTrack')}</Dialog.Title>
        <Dialog.Content>
          <Banner visible icon="information-outline" style={styles.banner}>
            {t('playlists.videoList.renameInfoBox')}
          </Banner>

          <View style={styles.originalTitleRow}>
            <Text variant="bodySmall" style={styles.originalTitleText} numberOfLines={2}>
              {t('playlists.videoList.originalTitle')}: {video.originalTitle ?? video.title}
            </Text>
            <IconButton icon="youtube" size={20} onPress={() => Linking.openURL(youtubeWatchUrl(video.youtubeId))} />
          </View>

          {hasSuggestion && suggestedResult && (
            <View style={[styles.suggestionBox, { borderColor: theme.colors.outline }]}>
              <Text variant="labelSmall">{t('playlists.videoList.suggestedName')}</Text>
              <Text variant="bodyMedium" style={styles.suggestionText}>
                {suggestedResult.artist ? `${suggestedResult.artist} - ${suggestedResult.title}` : suggestedResult.title}
              </Text>
              <Button compact onPress={handleUseSuggested} disabled={suggestedMatchesInputs}>
                {t('playlists.videoList.useSuggested')}
              </Button>
            </View>
          )}

          <TextInput
            mode="outlined"
            label={t('playlists.videoList.artistLabel')}
            value={artist}
            onChangeText={setArtist}
            disabled={submitting}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label={t('playlists.videoList.titleLabel')}
            value={title}
            onChangeText={setTitle}
            disabled={submitting}
          />
          <HelperText type="error" visible={error != null}>{error}</HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={submitting}>{t('common.cancel')}</Button>
          <Button onPress={handleSubmit} loading={submitting} disabled={submitting || !title.trim()}>
            {t('playlists.videoList.rename')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: -24, marginTop: -8, marginBottom: 8 },
  originalTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  originalTitleText: { flex: 1 },
  suggestionBox: { marginBottom: 12, padding: 10, borderWidth: 1, borderRadius: 8 },
  suggestionText: { marginVertical: 4 },
  input: { marginBottom: 12 },
});
