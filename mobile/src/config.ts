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

// Whether a server address is a complete URL — scheme required. No default
// scheme (and so no implied default port) is ever guessed: a self-hosted
// instance is as likely to be plain HTTP on a custom port as HTTPS on 443,
// so the user's typed address (port included, if not the scheme's default)
// is used exactly as given.
export function isCompleteServerUrl(input: string): boolean {
  return /^https?:\/\/.+/i.test(input.trim());
}

// Normalizes an already-complete URL ("https://host/api/",
// "http://192.168.1.50:8065") into a consistent API base URL by trimming
// trailing slashes and ensuring the fixed backend API path is present —
// this part isn't user-configurable, every instance mounts its API at
// /api (see frontend/nginx.conf's proxy_pass).
export function normalizeServerUrl(input: string): string {
  const url = input.trim().replace(/\/+$/, '');
  return /\/api$/i.test(url) ? url : `${url}/api`;
}
