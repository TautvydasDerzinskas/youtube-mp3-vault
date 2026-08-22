import { Box } from '@mui/material';
import { DeezerTab } from './DeezerTab';

// Hosts every per-user, opt-in-with-own-credentials HQ provider section —
// currently just Deezer, but built to hold more as they're added (each as
// its own gated section here, same shape as DeezerTab). Which providers
// actually render is entirely server-controlled (allowedHqProviders from
// AuthContext, sourced from the admin's "Allowed user HQ scan providers"
// setting — see SettingsPage/HqTab.tsx) — ProfilePage only mounts this tab
// at all once that list is non-empty, and each section below independently
// checks its own provider is still in it.
interface HqDownloadTabProps {
  allowedProviders: string[];
}

export function HqDownloadTab({ allowedProviders }: HqDownloadTabProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {allowedProviders.includes('deezer') && <DeezerTab />}
    </Box>
  );
}
