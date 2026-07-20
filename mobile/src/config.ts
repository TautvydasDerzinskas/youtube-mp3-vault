// Default suggestion shown on the server-address setup screen (see
// src/screens/ServerSetupScreen.tsx) — the self-hosted instance's LAN
// address, resolved by the router's local DNS. It's only a placeholder:
// nothing is used automatically, the user must test and confirm an address
// (this one or their own) before it's ever saved, since a stale/incorrect
// address here is exactly what breaks login silently.
export const DEFAULT_API_URL = 'https://youtubevault.mylan/api';

// Local development escape hatch — set to skip the setup screen entirely
// and always point at a fixed backend (e.g. one running on your dev
// machine) instead of whatever's saved on-device. See .env.example.
export const DEV_API_URL_OVERRIDE = process.env.EXPO_PUBLIC_API_URL;

// Normalizes free-form user input ("youtubevault.mylan", "10.0.2.2:3001",
// "https://host/api/") into a consistent API base URL
// ("https://youtubevault.mylan/api", "http://10.0.2.2:3001/api").
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  if (!/\/api$/i.test(url)) {
    url = `${url}/api`;
  }
  return url;
}
