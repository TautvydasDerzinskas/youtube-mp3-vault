import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Ported from qobuz-dl's qobuz_dl/bundle.py + qobuz_dl/qopy.py (Python), the
// reference implementation this provider is based on. Unlike Deezer (see
// deezer.ts), Qobuz doesn't encrypt track audio at all — once a signed
// track/getFileUrl call resolves, the returned URL is a plain, unencrypted
// download. What Qobuz does instead is gate every API call behind an
// "app_id"/"app_secret" pair lifted from Qobuz's own web player bundle (not
// publicly documented, not meant for third-party use) plus a per-user
// account login — so most of this file's complexity is obtaining and
// signing with those, not decrypting anything. Every user of this provider
// supplies their own Qobuz account email/password — see qobuzReplace.ts and
// routes/auth.ts's /qobuz endpoints — so this only ever streams tracks a
// user's own paid Qobuz account is already entitled to play.

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0';
const API_BASE = 'https://www.qobuz.com/api.json/0.2/';
const PLAYER_BASE = 'https://play.qobuz.com';

// Same rationale as every other per-request network timeout in this app
// (see deezer.ts/jiosaavn.ts/slskd.ts): a stalled request shouldn't hang the
// calling sync pass forever.
const FETCH_TIMEOUT_MS = 15_000;
const DOWNLOAD_FETCH_TIMEOUT_MS = 3 * 60_000;

// A long-lived, widely-available track used purely to probe which of the
// app secrets extracted from the bundle (see resolveWorkingSecret below) is
// the one actually accepted by Qobuz's API right now — mirrors qopy.py's
// own Client.test_secret(), which probes the exact same track id.
const PROBE_TRACK_ID = '5966783';

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function apiHeaders(appId: string, authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'X-App-Id': appId,
  };
  if (authToken) headers['X-User-Auth-Token'] = authToken;
  return headers;
}

// ─── App bundle (app_id + candidate secrets) ───────────────────────────────
// Qobuz's web player (play.qobuz.com) embeds an app_id and a handful of
// timezone-keyed, obfuscated "secret" strings inside its bundle.js — used to
// sign track/getFileUrl requests below. None of this is a public API; it's
// scraped the same way qobuz_dl/bundle.py does, and only ever changes when
// Qobuz ships a new player build, which is why the result is cached for the
// life of this process rather than re-scraped per request.

const BUNDLE_URL_REGEX = /<script src="(\/resources\/\d+\.\d+\.\d+-[a-z]\d{3}\/bundle\.js)"><\/script>/;
const APP_ID_REGEX = /production:\{api:\{appId:"(\d{9})",appSecret:"\w{32}"/;
// Captures a base64 "seed" per timezone (e.g. `n.initialSeed("abc==",window.utimezone.london)`).
const SEED_TIMEZONE_REGEX = /[a-z]\.initialSeed\("([\w=]+)",window\.utimezone\.([a-z]+)\)/g;

interface QobuzBundle {
  appId: string;
  // Each candidate is a base64-decoded `seed + info + extras` string for one
  // timezone — exactly one of these is the real, currently-valid app
  // secret; which one is only knowable by actually testing it (see
  // resolveWorkingSecret), same as the Python reference implementation.
  candidateSecrets: string[];
}

let bundleCache: QobuzBundle | null = null;
// Cached once a candidate secret is confirmed to actually work (see
// resolveWorkingSecret) — reused across every user's session so a secret
// that already proved itself never needs re-testing on every login.
let workingSecretCache: string | null = null;

async function scrapeBundle(): Promise<QobuzBundle | null> {
  let loginPage: string;
  try {
    const res = await fetchWithTimeout(`${PLAYER_BASE}/login`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    loginPage = await res.text();
  } catch {
    return null;
  }

  const bundleUrlMatch = loginPage.match(BUNDLE_URL_REGEX);
  if (!bundleUrlMatch) return null;

  let bundleJs: string;
  try {
    const res = await fetchWithTimeout(`${PLAYER_BASE}${bundleUrlMatch[1]}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    bundleJs = await res.text();
  } catch {
    return null;
  }

  const appIdMatch = bundleJs.match(APP_ID_REGEX);
  if (!appIdMatch) return null;

  // Every timezone's secret is built from three base64 fragments spliced
  // together — a seed (captured above) plus an "info"/"extras" pair keyed by
  // that same timezone name, capitalized, further down the bundle. Ported
  // directly from Bundle.get_secrets() in the Python reference; see that
  // function's own comments for why the pieces are laid out this way.
  const seeds = new Map<string, string>();
  for (const match of bundleJs.matchAll(SEED_TIMEZONE_REGEX)) {
    seeds.set(match[2], match[1]);
  }
  if (seeds.size === 0) return null;

  const timezones = [...seeds.keys()].map((tz) => tz[0].toUpperCase() + tz.slice(1)).join('|');
  const infoExtrasRegex = new RegExp(
    `name:"\\w+/(${timezones})",info:"([\\w=]+)",extras:"([\\w=]+)"`,
    'g',
  );

  const candidateSecrets: string[] = [];
  for (const match of bundleJs.matchAll(infoExtrasRegex)) {
    const [, timezone, info, extras] = match;
    const seed = seeds.get(timezone.toLowerCase());
    if (!seed) continue;
    // The trailing 44 characters are junk padding the Python reference
    // slices off before decoding (`[:-44]`) — kept identical here.
    const combined = `${seed}${info}${extras}`;
    const trimmed = combined.slice(0, Math.max(0, combined.length - 44));
    try {
      candidateSecrets.push(Buffer.from(trimmed, 'base64').toString('utf8'));
    } catch {
      // Malformed fragment — skip it, other candidates may still work.
    }
  }
  if (candidateSecrets.length === 0) return null;

  return { appId: appIdMatch[1], candidateSecrets };
}

async function getBundle(): Promise<QobuzBundle | null> {
  if (!bundleCache) bundleCache = await scrapeBundle();
  return bundleCache;
}

// ─── Request signing ────────────────────────────────────────────────────────

function signedParams(trackId: string, formatId: QobuzFormatId, secret: string): URLSearchParams {
  const ts = Math.floor(Date.now() / 1000);
  const sig = `trackgetFileUrlformat_id${formatId}intentstreamtrack_id${trackId}${ts}${secret}`;
  const hashed = createHash('md5').update(sig, 'utf8').digest('hex');
  return new URLSearchParams({
    request_ts: String(ts),
    request_sig: hashed,
    track_id: trackId,
    format_id: String(formatId),
    intent: 'stream',
  });
}

async function requestFileUrl(
  appId: string,
  authToken: string,
  trackId: string,
  formatId: QobuzFormatId,
  secret: string,
): Promise<{ ok: true; sample: boolean; url: string | null } | { ok: false; invalidSecret: boolean }> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}track/getFileUrl?${signedParams(trackId, formatId, secret)}`,
      { headers: apiHeaders(appId, authToken) },
    );
    if (res.status === 400) return { ok: false, invalidSecret: true };
    if (!res.ok) return { ok: false, invalidSecret: false };
    const data: any = await res.json();
    return { ok: true, sample: data?.sample === true, url: typeof data?.url === 'string' ? data.url : null };
  } catch {
    return { ok: false, invalidSecret: false };
  }
}

// Finds which of the bundle's candidate secrets Qobuz's API currently
// accepts, by probing PROBE_TRACK_ID with each in turn — mirrors
// Client.cfg_setup() in the Python reference. Needs a real, already
// logged-in authToken: an app secret can only be validated via a signed
// call that Qobuz itself gates on the caller also being logged in.
async function resolveWorkingSecret(appId: string, authToken: string, candidates: string[]): Promise<string | null> {
  if (workingSecretCache) {
    const probe = await requestFileUrl(appId, authToken, PROBE_TRACK_ID, 5, workingSecretCache);
    if (probe.ok) return workingSecretCache;
    // Cached secret no longer works (Qobuz rotated its bundle) — fall
    // through and re-resolve from the freshly-scraped candidate list.
    workingSecretCache = null;
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const probe = await requestFileUrl(appId, authToken, PROBE_TRACK_ID, 5, candidate);
    if (probe.ok) {
      workingSecretCache = candidate;
      return candidate;
    }
  }
  return null;
}

// ─── Login ──────────────────────────────────────────────────────────────────

interface QobuzLoginResult {
  authToken: string;
  label: string;
}

async function login(email: string, password: string, appId: string): Promise<QobuzLoginResult | null> {
  const params = new URLSearchParams({ email, password, app_id: appId });
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}user/login?${params}`, { headers: apiHeaders(appId) });
  } catch {
    return null;
  }
  if (!res.ok) return null; // 401 invalid credentials, 400 invalid app id — either way, not usable

  const data: any = await res.json();
  const authToken = data?.user_auth_token;
  const parameters = data?.user?.credential?.parameters;
  if (typeof authToken !== 'string' || !parameters) return null; // missing `parameters` = free account, ineligible to stream
  return { authToken, label: parameters.short_label ?? 'Qobuz' };
}

// ─── Public API ─────────────────────────────────────────────────────────────

// 5 = MP3 320kbps, 6 = FLAC 16-bit/44.1kHz, 7 = FLAC 24-bit/<=96kHz,
// 27 = FLAC 24-bit Hi-Res/>96kHz — Qobuz's own format_id values, unchanged
// from the Python reference (qopy.py's InvalidQuality check uses the same set).
export type QobuzFormatId = 5 | 6 | 7 | 27;

// Best-to-worst — used by qobuzReplace.ts's downloadAndReplace to always ask
// for the best quality this specific track+account combination actually has,
// falling back one tier at a time rather than committing to a fixed quality
// up front (Qobuz's hi-res/lossless masters aren't universal, same caveat
// deezerReplace.ts documents for Deezer's FLAC masters).
export const QOBUZ_FORMAT_PREFERENCE: QobuzFormatId[] = [27, 7, 6, 5];

export interface QobuzSession {
  appId: string;
  authToken: string;
  secret: string;
  label: string;
}

// Confirms an email/password still logs in and is eligible to stream at
// all — used by routes/auth.ts's PATCH /qobuz to verify a credential the
// moment it's saved, same "check it now, not just at the next sync" spirit
// as deezer.ts's verifyDeezerLogin.
export async function verifyQobuzLogin(email: string, password: string): Promise<boolean> {
  const bundle = await getBundle();
  if (!bundle) return false;
  return (await login(email, password, bundle.appId)) !== null;
}

// Establishes everything a sync pass needs from one email/password: a fresh
// login (Qobuz has no long-lived cookie a user could hand us the way
// Deezer's "arl" is, so this logs in from scratch every time it's called,
// same cadence as deezerReplace.ts calling establishDeezerSession once per
// sync pass) plus a working app secret to sign download requests with.
// Returns null for a dead login, an ineligible (free) account, or if the
// app bundle/secret can't be resolved right now — any of those makes this
// provider a no-op for this pass, exactly as if the user had no credentials
// saved at all.
export async function establishQobuzSession(email: string, password: string): Promise<QobuzSession | null> {
  if (!email.trim() || !password) return null;

  const bundle = await getBundle();
  if (!bundle) return null;

  const loggedIn = await login(email, password, bundle.appId);
  if (!loggedIn) return null;

  const secret = await resolveWorkingSecret(bundle.appId, loggedIn.authToken, bundle.candidateSecrets);
  if (!secret) return null;

  return { appId: bundle.appId, authToken: loggedIn.authToken, secret, label: loggedIn.label };
}

export interface QobuzSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number | null;
}

// Qobuz's track/search endpoint — needs only an app_id (X-App-Id header),
// no user login, used purely to find candidate ids to match against (see
// qobuzReplace.ts's findQobuzCandidate). Actually downloading a match still
// needs a signed, per-user getFileUrl call, same division of responsibility
// as searchDeezerTracks/getDeezerTrackToken in deezer.ts.
export async function searchQobuzTracks(query: string, limit = 10): Promise<QobuzSearchResult[]> {
  const bundle = await getBundle();
  if (!bundle) return [];

  const params = new URLSearchParams({ query, limit: String(limit) });
  try {
    const res = await fetchWithTimeout(`${API_BASE}track/search?${params}`, { headers: apiHeaders(bundle.appId) });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] = data?.tracks?.items ?? [];
    return items.map((item): QobuzSearchResult => ({
      id: String(item.id),
      title: item.title ?? '',
      artist: item.performer?.name ?? item.album?.artist?.name ?? '',
      album: item.album?.title ?? '',
      durationSec: typeof item.duration === 'number' ? item.duration : null,
    }));
  } catch {
    return [];
  }
}

export interface QobuzTrackUrl {
  url: string;
  formatId: QobuzFormatId;
}

// Resolves the best download URL this session can actually get for
// `trackId`, trying `formats` (defaults to QOBUZ_FORMAT_PREFERENCE) from
// best to worst and returning the first one Qobuz actually grants — a
// `sample: true`/missing-url response means this account isn't entitled to
// that specific quality for this specific track (no universal hi-res/FLAC
// master, or an account without that tier), not a hard failure, so the next
// lower format is tried rather than giving up. Also transparently re-resolves
// the app secret once if Qobuz reports it invalid (a rotated bundle mid-session).
export async function getBestQobuzTrackUrl(
  session: QobuzSession,
  trackId: string,
  formats: QobuzFormatId[] = QOBUZ_FORMAT_PREFERENCE,
): Promise<QobuzTrackUrl | null> {
  let secret = session.secret;
  for (const formatId of formats) {
    let result = await requestFileUrl(session.appId, session.authToken, trackId, formatId, secret);
    if (!result.ok && result.invalidSecret) {
      const bundle = await getBundle();
      const refreshed = bundle ? await resolveWorkingSecret(session.appId, session.authToken, bundle.candidateSecrets) : null;
      if (!refreshed) return null;
      secret = refreshed;
      result = await requestFileUrl(session.appId, session.authToken, trackId, formatId, secret);
    }
    if (result.ok && !result.sample && result.url) return { url: result.url, formatId };
  }
  return null;
}

export async function downloadQobuzTrack(url: string, destPath: string): Promise<void> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, DOWNLOAD_FETCH_TIMEOUT_MS);
  if (!res.ok || !res.body) throw new Error(`Qobuz media download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
}
