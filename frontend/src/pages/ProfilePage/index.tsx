import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';
import { ProfileHeader } from './ProfileHeader';
import { ProfileTab } from './ProfileTab';
import { SettingsTab } from './SettingsTab';
import { LastfmTab } from './LastfmTab';
import { HqDownloadTab } from './HqDownloadTab';

type TabKey = 'profile' | 'settings' | 'lastfm' | 'hq';

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastfmScrobblingAvailable, allowedHqProviders } = useAuth();
  const online = useOnlineStatus();
  const showLastfmTab = lastfmScrobblingAvailable && online;
  // Hides the whole tab once the admin has disabled every per-user HQ
  // provider (currently just Deezer) — not just the individual provider
  // section within it, since an empty tab would be pointless to show at all.
  const showHqDownloadTab = allowedHqProviders.length > 0;
  const [searchParams, setSearchParams] = useSearchParams();
  const lastfmResult = searchParams.get('lastfm');

  // URL-driven rather than local state — so a UserMenu link straight into
  // e.g. ?tab=hq lands on the right tab even when already on this page (a
  // same-route param change re-renders but doesn't remount), and so the tab
  // survives a refresh/bookmark.
  const isValidTab = (key: string | null): key is TabKey => {
    if (key === 'profile' || key === 'settings') return true;
    if (key === 'lastfm') return showLastfmTab;
    if (key === 'hq') return showHqDownloadTab;
    return false;
  };
  const tabParam = searchParams.get('tab');
  const tab: TabKey = isValidTab(tabParam) ? tabParam : (lastfmResult ? 'lastfm' : 'profile');

  // Clears the one-shot `lastfm` OAuth-redirect result param once read, and
  // normalizes the URL to carry `tab` explicitly (covers the lastfmResult
  // default-tab case above, so the address bar reflects what's actually shown).
  useEffect(() => {
    if (!lastfmResult && tabParam === tab) return;
    const params = new URLSearchParams(searchParams);
    params.delete('lastfm');
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastfmResult, tabParam]);

  const handleTabChange = (_: React.SyntheticEvent, value: TabKey) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    setSearchParams(params);
  };

  return (
    <Box sx={{ p: 3 }}>
      <ProfileHeader title={t('profile.title')} onBack={() => navigate('/dashboard')} />

      <Box sx={{ maxWidth: 480 }}>
        <Tabs value={tab} onChange={handleTabChange} variant="fullWidth" sx={{ mb: 3 }}>
          <Tab value="profile" label={t('profile.tabProfile')} />
          <Tab value="settings" label={t('profile.tabSettings')} />
          {showLastfmTab && <Tab value="lastfm" label={t('profile.tabLastfm')} />}
          {showHqDownloadTab && <Tab value="hq" label={t('profile.tabHqDownload')} />}
        </Tabs>

        {tab === 'profile' && <ProfileTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'lastfm' && <LastfmTab result={lastfmResult} />}
        {tab === 'hq' && <HqDownloadTab allowedProviders={allowedHqProviders} />}
      </Box>
    </Box>
  );
}
