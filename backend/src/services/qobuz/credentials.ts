// Ported from the standalone qobuz_module prototype (not part of this repo) — its src/server/qobuzCredentials.ts (itself ported
// from SpotiFLAC's qobuz_api.go) — scrapes the app_id/app_secret pair
// open.qobuz.com's own web bundle uses, signs requests the same way Qobuz's
// own web client does, and caches the pair on disk for 24h so this doesn't
// re-scrape on every search.
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';
import { ensureQobuzDataDir } from './appDir';

export const QOBUZ_API_BASE_URL = 'https://www.qobuz.com/api.json/0.2';
const DEFAULT_APP_ID = '712109809';
const DEFAULT_APP_SECRET = '589be88e4538daea11f509d29e4a23b1';
const OPEN_TRACK_PROBE_URL = 'https://open.qobuz.com/track/1';
const CREDENTIALS_CACHE_FILE = 'credentials.json';
const CREDENTIALS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CREDENTIALS_PROBE_ISRC = 'USUM71703861';

// Same UA every request in this module uses (see httpHeaders.ts's
// DEFAULT_DOWNLOADER_USER_AGENT in the original) — Qobuz's open-bundle scrape
// and its signed API both expect a real browser UA, not node-fetch's default.
export const QOBUZ_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const BUNDLE_SCRIPT_RE = /<script[^>]+src="([^"]+\/js\/main\.js|\/resources\/[^"]+\/js\/main\.js)"/;
const API_CONFIG_RE = /app_id:"(\d{9})",app_secret:"([a-f0-9]{32})"/;

export interface QobuzCredentials {
  appId: string;
  appSecret: string;
  source: string;
  fetchedAtMs: number;
}

function defaultCredentials(): QobuzCredentials {
  return { appId: DEFAULT_APP_ID, appSecret: DEFAULT_APP_SECRET, source: 'embedded-default', fetchedAtMs: Date.now() };
}

async function cachePath(): Promise<string> {
  return join(await ensureQobuzDataDir(), CREDENTIALS_CACHE_FILE);
}

async function loadCachedCredentials(): Promise<QobuzCredentials | null> {
  try {
    const raw = JSON.parse(await readFile(await cachePath(), 'utf8')) as QobuzCredentials;
    if (!raw.appId || !raw.appSecret) return null;
    return raw;
  } catch {
    return null;
  }
}

async function saveCachedCredentials(creds: QobuzCredentials): Promise<void> {
  await writeFile(await cachePath(), JSON.stringify(creds, null, 2));
}

function isFresh(creds: QobuzCredentials | null): creds is QobuzCredentials {
  if (!creds || !creds.fetchedAtMs || !creds.appId || !creds.appSecret) return false;
  return Date.now() - creds.fetchedAtMs < CREDENTIALS_CACHE_TTL_MS;
}

async function scrapeOpenCredentials(): Promise<QobuzCredentials> {
  const shellResp = await fetch(OPEN_TRACK_PROBE_URL, { headers: { 'User-Agent': QOBUZ_USER_AGENT } });
  if (!shellResp.ok) {
    throw new Error(`open.qobuz.com returned status ${shellResp.status}`);
  }
  const html = await shellResp.text();
  const scriptMatch = BUNDLE_SCRIPT_RE.exec(html);
  if (!scriptMatch) throw new Error('qobuz open bundle URL not found');

  let bundleURL = scriptMatch[1].trim();
  if (bundleURL.startsWith('/')) bundleURL = 'https://open.qobuz.com' + bundleURL;
  if (!bundleURL) throw new Error('qobuz open bundle URL is empty');

  const bundleResp = await fetch(bundleURL, { headers: { 'User-Agent': QOBUZ_USER_AGENT } });
  if (!bundleResp.ok) {
    throw new Error(`qobuz open bundle returned status ${bundleResp.status}`);
  }
  const bundleBody = await bundleResp.text();
  const configMatch = API_CONFIG_RE.exec(bundleBody);
  if (!configMatch) throw new Error('qobuz api app_id/app_secret pair not found in open bundle');

  return {
    appId: configMatch[1].trim(),
    appSecret: configMatch[2].trim(),
    source: bundleURL,
    fetchedAtMs: Date.now(),
  };
}

function qobuzNormalizedPath(p: string): string {
  return p.trim().replace(/^\/+|\/+$/g, '');
}

function signaturePayload(pathStr: string, params: Record<string, string>, timestamp: string, secret: string): string {
  const normalizedPath = qobuzNormalizedPath(pathStr).replace(/\//g, '');
  const keys = Object.keys(params)
    .filter((k) => k !== 'app_id' && k !== 'request_ts' && k !== 'request_sig')
    .sort();
  let payload = normalizedPath;
  for (const key of keys) {
    payload += key + params[key];
  }
  payload += timestamp + secret;
  return payload;
}

function requestSignature(pathStr: string, params: Record<string, string>, timestamp: string, secret: string): string {
  return crypto.createHash('md5').update(signaturePayload(pathStr, params, timestamp, secret)).digest('hex');
}

function buildSignedURL(pathStr: string, params: Record<string, string>, creds: QobuzCredentials): string {
  const normalizedPath = qobuzNormalizedPath(pathStr);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query = new URLSearchParams(params);
  query.set('app_id', creds.appId);
  query.set('request_ts', timestamp);
  query.set('request_sig', requestSignature(pathStr, params, timestamp, creds.appSecret));
  return `${QOBUZ_API_BASE_URL}/${normalizedPath}?${query.toString()}`;
}

async function credentialsSupportSignedMetadata(creds: QobuzCredentials): Promise<boolean> {
  try {
    const url = buildSignedURL('track/search', { query: CREDENTIALS_PROBE_ISRC, limit: '1' }, creds);
    const resp = await fetch(url, {
      headers: { 'User-Agent': QOBUZ_USER_AGENT, Accept: 'application/json', 'X-App-Id': creds.appId },
    });
    if (!resp.ok) return false;
    const body = (await resp.json()) as { tracks?: { total?: number } };
    return (body.tracks?.total ?? 0) > 0;
  } catch {
    return false;
  }
}

let inMemoryCredentials: QobuzCredentials | null = null;

async function getQobuzAPICredentials(forceRefresh = false): Promise<QobuzCredentials> {
  if (!forceRefresh && isFresh(inMemoryCredentials)) return inMemoryCredentials;

  const cachedFromDisk = await loadCachedCredentials();
  if (!forceRefresh && isFresh(cachedFromDisk)) {
    inMemoryCredentials = cachedFromDisk;
    return inMemoryCredentials;
  }

  try {
    const scraped = await scrapeOpenCredentials();
    if (await credentialsSupportSignedMetadata(scraped)) {
      inMemoryCredentials = scraped;
      await saveCachedCredentials(scraped);
      return inMemoryCredentials;
    }
    throw new Error('scraped qobuz credentials did not pass validation');
  } catch (scrapeErr) {
    if (cachedFromDisk) {
      inMemoryCredentials = cachedFromDisk;
      return inMemoryCredentials;
    }
    if (inMemoryCredentials) return inMemoryCredentials;
    console.warn(`[qobuz] Failed to refresh Qobuz credentials, using embedded fallback: ${(scrapeErr as Error).message}`);
    inMemoryCredentials = defaultCredentials();
    return inMemoryCredentials;
  }
}

function shouldRefreshCredentials(status: number): boolean {
  return status === 400 || status === 401;
}

export async function doQobuzSignedRequest(pathStr: string, params: Record<string, string>): Promise<Response> {
  const call = async (forceRefresh: boolean): Promise<Response> => {
    const creds = await getQobuzAPICredentials(forceRefresh);
    const url = buildSignedURL(pathStr, params, creds);
    return fetch(url, {
      headers: { 'User-Agent': QOBUZ_USER_AGENT, Accept: 'application/json', 'X-App-Id': creds.appId },
    });
  };

  const resp = await call(false);
  if (shouldRefreshCredentials(resp.status)) {
    return call(true);
  }
  return resp;
}

export async function doQobuzSignedJSONRequest<T>(pathStr: string, params: Record<string, string>): Promise<T> {
  const resp = await doQobuzSignedRequest(pathStr, params);
  if (!resp.ok) {
    const snippet = (await resp.text()).slice(0, 2048);
    throw new Error(`qobuz request failed: HTTP ${resp.status}: ${snippet.trim()}`);
  }
  return (await resp.json()) as T;
}
