import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { adminApi, SmtpSettings, PostgresSettings, LastfmSettings, HqSettings } from '../api/admin';
import { SmtpTabContent } from './adminSettings/SmtpTabContent';
import { LastfmTabContent } from './adminSettings/LastfmTabContent';
import { HqTabContent } from './adminSettings/HqTabContent';
import { PostgresTabContent } from './adminSettings/PostgresTabContent';

const EMPTY_SMTP: SmtpSettings = { host: null, port: 587, secure: false, user: null, pass: null, from: '' };
const EMPTY_POSTGRES: PostgresSettings = { database: '', user: '', password: '' };
const EMPTY_LASTFM: LastfmSettings = { apiKey: null, apiSecret: null };
const EMPTY_HQ: HqSettings = { autoDownloadEnabled: false, allowedUserProviders: [] };

type SettingsTabKey = 'smtp' | 'lastfm' | 'hq' | 'postgres';

// Mirrors web's SettingsPage (SMTP / Last.fm / HQ / Postgres, one long
// scrolling page with dividers there) but tabbed, the same pattern
// ProfileScreen already uses for its own 3 sections — 4 substantial forms
// stacked on one screen would mean a lot of scrolling to reach the one you
// actually came for.
export function AdminSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [tab, setTab] = useState<SettingsTabKey>('smtp');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [smtp, setSmtp] = useState<SmtpSettings>(EMPTY_SMTP);
  const [lastfm, setLastfm] = useState<LastfmSettings>(EMPTY_LASTFM);
  const [hq, setHq] = useState<HqSettings>(EMPTY_HQ);
  const [postgres, setPostgres] = useState<PostgresSettings>(EMPTY_POSTGRES);

  useEffect(() => {
    adminApi.getSettings()
      .then(({ smtp, postgres, lastfm, hq }) => {
        setSmtp(smtp); setPostgres(postgres); setLastfm(lastfm); setHq(hq);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text>{t('adminSettings.failedToLoad')}</Text>
      </View>
    );
  }

  const buttons = [
    { value: 'smtp', label: t('adminSettings.tabSmtp') },
    { value: 'lastfm', label: t('adminSettings.tabLastfm') },
    { value: 'hq', label: t('adminSettings.tabHq') },
    { value: 'postgres', label: t('adminSettings.tabPostgres') },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <SegmentedButtons
          value={tab}
          onValueChange={(value) => setTab(value as SettingsTabKey)}
          buttons={buttons}
          density="small"
          style={styles.segmented}
        />

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {tab === 'smtp' && <SmtpTabContent smtp={smtp} onSaved={setSmtp} />}
          {tab === 'lastfm' && <LastfmTabContent lastfm={lastfm} onSaved={setLastfm} />}
          {tab === 'hq' && <HqTabContent hq={hq} onSaved={setHq} />}
          {tab === 'postgres' && <PostgresTabContent postgres={postgres} onSaved={setPostgres} />}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: 16 },
  segmented: { marginBottom: 16 },
  scrollContent: { paddingBottom: 24 },
});
