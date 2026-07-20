export const DEFAULT_API_URL = 'https://youtubevault.mylan/api';

export const DEV_API_URL_OVERRIDE = process.env.EXPO_PUBLIC_API_URL;

export function isCompleteServerUrl(input: string): boolean {
  return /^https?:\/\/.+/i.test(input.trim());
}

export function normalizeServerUrl(input: string): string {
  const url = input.trim().replace(/\/+$/, '');
  return /\/api$/i.test(url) ? url : `${url}/api`;
}
