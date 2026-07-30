import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { ProfileTabContent } from './profile/ProfileTabContent';
import { SettingsTabContent } from './profile/SettingsTabContent';
import { LastfmTabContent } from './profile/LastfmTabContent';

type ProfileTabKey = 'profile' | 'settings' | 'lastfm';

// Reached by tapping the avatar in TopBar. Mirrors web's ProfilePage 3-tab
// layout (Profile / Settings / Last.fm), but with a fixed logout bar
// pinned to the bottom of the screen at all times, rather than web's
// logout button living in the per-page header — logging out is the one
// action that should never require switching tabs first to reach it.
export function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { logout, lastfmScrobblingAvailable } = useAuth();
  const [tab, setTab] = useState<ProfileTabKey>('profile');

  const buttons = [
    { value: 'profile', label: t('profile.tabProfile') },
    { value: 'settings', label: t('profile.tabSettings') },
    ...(lastfmScrobblingAvailable ? [{ value: 'lastfm', label: t('profile.tabLastfm') }] : []),
  ];

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <SegmentedButtons
          value={tab}
          onValueChange={(value) => setTab(value as ProfileTabKey)}
          buttons={buttons}
          style={styles.segmented}
        />

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {tab === 'profile' && <ProfileTabContent />}
          {tab === 'settings' && <SettingsTabContent />}
          {tab === 'lastfm' && lastfmScrobblingAvailable && <LastfmTabContent />}
        </ScrollView>
      </View>

      <View
        style={[
          styles.logoutBar,
          { borderTopColor: theme.colors.outline, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Button mode="outlined" textColor={theme.colors.error} onPress={() => logout()}>
          {t('profile.logout')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, padding: 16 },
  segmented: { marginBottom: 16 },
  scrollContent: { paddingBottom: 24 },
  logoutBar: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
});
