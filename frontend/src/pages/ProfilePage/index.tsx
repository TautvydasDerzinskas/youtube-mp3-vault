import { useEffect, useState } from 'react';
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
  const [tab, setTab] = useState(lastfmResult ? 2 : 0);

  useEffect(() => {
    if (lastfmResult) setSearchParams({}, { replace: true });
  }, []);

  const hqDownloadTabIndex = showLastfmTab ? 3 : 2;

  return (
    <Box sx={{ p: 3 }}>
      <ProfileHeader title={t('profile.title')} onBack={() => navigate('/dashboard')} />

      <Box sx={{ maxWidth: 480 }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="fullWidth" sx={{ mb: 3 }}>
          <Tab label={t('profile.tabProfile')} />
          <Tab label={t('profile.tabSettings')} />
          {showLastfmTab && <Tab label={t('profile.tabLastfm')} />}
          {showHqDownloadTab && <Tab label={t('profile.tabHqDownload')} />}
        </Tabs>

        {tab === 0 && <ProfileTab />}
        {tab === 1 && <SettingsTab />}
        {tab === 2 && showLastfmTab && <LastfmTab result={lastfmResult} />}
        {tab === hqDownloadTabIndex && showHqDownloadTab && <HqDownloadTab allowedProviders={allowedHqProviders} />}
      </Box>
    </Box>
  );
}
