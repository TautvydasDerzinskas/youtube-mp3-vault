import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../PlaylistsPage/hooks/useOnlineStatus';
import { ProfileHeader } from './ProfileHeader';
import { ProfileTab } from './ProfileTab';
import { LastfmTab } from './LastfmTab';

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastfmScrobblingAvailable } = useAuth();
  const online = useOnlineStatus();
  const showLastfmTab = lastfmScrobblingAvailable && online;
  const [searchParams, setSearchParams] = useSearchParams();
  const lastfmResult = searchParams.get('lastfm');
  const [tab, setTab] = useState(lastfmResult ? 1 : 0);

  useEffect(() => {
    if (lastfmResult) setSearchParams({}, { replace: true });
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <ProfileHeader title={t('profile.title')} onBack={() => navigate('/playlists')} />

      <Box sx={{ maxWidth: 480 }}>
        {showLastfmTab ? (
          <>
            <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="fullWidth" sx={{ mb: 3 }}>
              <Tab label={t('profile.tabProfile')} />
              <Tab label={t('profile.tabLastfm')} />
            </Tabs>

            {tab === 0 && <ProfileTab />}
            {tab === 1 && <LastfmTab result={lastfmResult} />}
          </>
        ) : (
          <ProfileTab />
        )}
      </Box>
    </Box>
  );
}
