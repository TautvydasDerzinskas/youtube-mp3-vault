import { createDecipheriv } from 'crypto';
import { createWriteStream } from 'fs';

// Ported from Tidal-Media-Downloader's TIDALDL-PY/tidal_dl/tidal.py +
// apiKey.py (Python), the reference implementation this provider is based
// on. Unlike Deezer (a copyable session cookie) or Qobuz (a real
// email/password login), Tidal's own web/desktop apps don't expose anything
// a user could hand us directly — what this uses instead is the OAuth2
// "device code" flow Tidal's TV/games-console apps use: the user opens a
// short link and enters a code this app shows them (see
// startDeviceAuth/pollDeviceAuth below and routes/auth.ts's /tidal/start+poll
// endpoints), which nets an access/refresh token pair scoped to that user's
// own account, same as sitting down at a smart TV and logging in. The
// clientId/clientSecret pair below is a reverse-engineered app credential —
// not a public developer API, same category of unofficial-API reliance as
// Qobuz's scraped app_id/app_secret (see qobuz.ts) or Deezer's arl cookie.
// Originally the Fire TV pair from apiKey.py; swapped for the pair
// github.com/oskvr37/tiddl uses (base64 blob in its auth/client.py) since
// the Fire TV one — being the most widely embedded public Tidal credential —
// is the more likely one to have been throttled/blocked.
const CLIENT_ID = '4N3n6Q1x95LL5K7p';
const CLIENT_SECRET = 'oKOXfJW371cX6xaZ0PyhgGNBdNLlBZd4AKKYougMjik=';

const AUTH_BASE = 'https://auth.tidal.com/v1/oauth2';
// Was api.tidalhifi.com (the legacy host TIDALDL-PY uses) — switched to match
// verifyAccessToken's /sessions call below, which is the one call in this
// file known to work against these stored credentials, and to match tiddl
// (github.com/oskvr37/tiddl), a currently-maintained reference that uses
// this host uniformly for every endpoint including playbackinfopostpaywall.
const API_BASE = 'https://api.tidal.com/v1/';

// Same rationale as every other per-request network timeout in this app
// (see deezer.ts/qobuz.ts/jiosaavn.ts/slskd.ts): a stalled request shouldn't
// hang the calling sync pass forever.
const FETCH_TIMEOUT_MS = 15_000;
const DOWNLOAD_FETCH_TIMEOUT_MS = 3 * 60_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

// ─── Device-code auth ───────────────────────────────────────────────────────
// Two-step flow, split across a "start" and "poll" call so routes/auth.ts
// can hand the verification URL/code to the client immediately and then let
// it poll for completion without holding an HTTP request open the whole
// time the user is off in their browser confirming — see
// PENDING_DEVICE_AUTH below for where the in-flight deviceCode lives between
// those two calls.

export interface TidalDeviceAuth {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSec: number;
  intervalSec: number;
}

// Kicks off a new device-code grant — mirrors getDeviceCode() in the Python
// reference. The returned verificationUri+userCode is what the user is shown
// (open the link, type the code); deviceCode is what pollDeviceAuth below
// exchanges for real tokens once they've done that.
export async function startDeviceAuth(): Promise<TidalDeviceAuth | null> {
  try {
    const res = await fetchWithTimeout(`${AUTH_BASE}/device_authorization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, scope: 'r_usr+w_usr+w_sub' }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (typeof data.deviceCode !== 'string') return null;
    return {
      deviceCode: data.deviceCode,
      userCode: data.userCode,
      verificationUri: data.verificationUri,
      expiresInSec: data.expiresIn,
      intervalSec: data.interval,
    };
  } catch {
    return null;
  }
}

// Holds the one in-flight device-code grant per user between routes/auth.ts's
// POST /tidal/start (which creates it) and repeated GET /tidal/poll calls
// (which check it) — deliberately in-memory, not a DB table: it's short-lived
// (a few minutes, same TTL Tidal itself puts on the code) and per-process is
// fine since there's exactly one backend instance. Never exported directly;
// see setPendingDeviceAuth/getPendingDeviceAuth/clearPendingDeviceAuth below.
interface PendingDeviceAuth extends TidalDeviceAuth {
  startedAt: number;
}
const pendingDeviceAuth = new Map<string, PendingDeviceAuth>();

export function setPendingDeviceAuth(userId: string, auth: TidalDeviceAuth): void {
  pendingDeviceAuth.set(userId, { ...auth, startedAt: Date.now() });
}

// Returns null once Tidal's own expiresInSec has elapsed since start — a
// poll past that point can never succeed (the device code itself is dead on
// Tidal's side), so this is treated identically to "never started",
// prompting the client to call start again for a fresh code.
export function getPendingDeviceAuth(userId: string): PendingDeviceAuth | null {
  const entry = pendingDeviceAuth.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.startedAt > entry.expiresInSec * 1000) {
    pendingDeviceAuth.delete(userId);
    return null;
  }
  return entry;
}

export function clearPendingDeviceAuth(userId: string): void {
  pendingDeviceAuth.delete(userId);
}

export interface TidalTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  countryCode: string;
}

export type PollResult =
  | { status: 'authorized'; tokens: TidalTokens }
  | { status: 'pending' }
  | { status: 'error' };

// Exchanges a deviceCode from startDeviceAuth for tokens, once the user has
// actually confirmed it on tidal.com — mirrors checkAuthStatus() in the
// Python reference. 'pending' (Tidal's own sub_status 1002, "authorization
// pending") just means the user hasn't finished yet — the caller (routes/
// auth.ts's GET /tidal/poll) is expected to call this again after
// intervalSec, same cadence a device-code flow always polls at. Any other
// non-200 (expired code, denied, network failure) is reported as 'error'
// rather than distinguished further — the client's only sane response to
// any of those is "start over" (see startDeviceAuth again).
export async function pollDeviceAuth(deviceCode: string): Promise<PollResult> {
  try {
    const res = await fetchWithTimeout(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        scope: 'r_usr+w_usr+w_sub',
      }),
    });
    const data: any = await res.json();
    if (res.ok && typeof data.access_token === 'string') {
      return {
        status: 'authorized',
        tokens: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          userId: String(data.user?.userId ?? ''),
          countryCode: data.user?.countryCode ?? '',
        },
      };
    }
    if (data?.status === 400 && data?.sub_status === 1002) return { status: 'pending' };
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

// Exchanges a stored refresh token for a fresh access token — mirrors
// refreshAccessToken() in the Python reference. Tidal doesn't rotate the
// refresh token on this grant, so only the access token (and possibly
// userId/countryCode, unchanged in practice) comes back; the caller keeps
// using the same refreshToken it already had. Returns null for a dead/
// revoked refresh token, same "this account needs to be reconnected from
// scratch" signal establishTidalSession below treats a failed verify as.
async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; userId: string; countryCode: string } | null> {
  try {
    const res = await fetchWithTimeout(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'r_usr+w_usr+w_sub',
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (typeof data.access_token !== 'string') return null;
    return {
      accessToken: data.access_token,
      userId: String(data.user?.userId ?? ''),
      countryCode: data.user?.countryCode ?? '',
    };
  } catch {
    return null;
  }
}

async function verifyAccessToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout('https://api.tidal.com/v1/sessions', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Session ────────────────────────────────────────────────────────────────

export interface TidalSession {
  accessToken: string;
  userId: string;
  countryCode: string;
}

// Establishes what a sync pass needs from a stored token pair — verifies the
// access token first and, only if that's gone stale, spends a refresh call
// on it (cheaper than Qobuz's "log in from scratch every time" cadence,
// since Tidal's device-code grant hands us something actually long-lived to
// refresh instead of a raw password). `onRefreshed` lets the caller persist
// a rotated access token back to the User row immediately, same "don't
// silently drift from what's actually stored" spirit as the rest of this
// file — see slskdQualityWorker.ts's tidalSession block. Returns null for a
// dead/revoked refresh token (nothing left to do but ask the user to
// reconnect), exactly as if no credentials were saved at all.
// Redacted presence/shape check, not the secret itself — safe to ship to
// logs (console output can end up in aggregators/issue reports).
function describeSecret(value: string): string {
  if (!value) return '<empty>';
  return `<len=${value.length}, starts="${value.slice(0, 4)}...">`;
}

export async function establishTidalSession(
  user: { tidalAccessToken: string; tidalRefreshToken: string; tidalUserId: string; tidalCountryCode: string },
  onRefreshed?: (accessToken: string) => void
): Promise<TidalSession | null> {
  // Temporary diagnostic for the "every track rejected with 4005" investigation
  // — remove once the stored-credential shape is confirmed. See
  // getBestTidalTrackUrl's own diagnostic log for the other half of this.
  console.log(
    `[tidal] stored credentials: accessToken=${describeSecret(user.tidalAccessToken)}, refreshToken=${describeSecret(user.tidalRefreshToken)}, userId="${user.tidalUserId}", countryCode="${user.tidalCountryCode}"`
  );

  if (!user.tidalAccessToken || !user.tidalRefreshToken) return null;

  if (await verifyAccessToken(user.tidalAccessToken)) {
    console.log(`[tidal] session established from stored access token: userId="${user.tidalUserId}", countryCode="${user.tidalCountryCode}"`);
    return { accessToken: user.tidalAccessToken, userId: user.tidalUserId, countryCode: user.tidalCountryCode };
  }

  const refreshed = await refreshAccessToken(user.tidalRefreshToken);
  if (!refreshed) return null;

  onRefreshed?.(refreshed.accessToken);
  console.log(
    `[tidal] session established via refresh: userId="${refreshed.userId || user.tidalUserId}", countryCode="${refreshed.countryCode || user.tidalCountryCode}" (refresh response gave userId="${refreshed.userId}", countryCode="${refreshed.countryCode}")`
  );
  return {
    accessToken: refreshed.accessToken,
    userId: refreshed.userId || user.tidalUserId,
    countryCode: refreshed.countryCode || user.tidalCountryCode,
  };
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface TidalSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number | null;
}

// Tidal's own /search endpoint, scoped to tracks only — used purely to find
// candidate ids to match against (see tidalReplace.ts's findTidalCandidate),
// same division of responsibility as searchQobuzTracks/searchDeezerTracks.
export async function searchTidalTracks(session: TidalSession, query: string, limit = 10): Promise<TidalSearchResult[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    offset: '0',
    types: 'TRACKS',
    countryCode: session.countryCode,
  });
  try {
    const res = await fetchWithTimeout(`${API_BASE}search?${params}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] = data?.tracks?.items ?? [];
    return items.map((item): TidalSearchResult => ({
      id: String(item.id),
      title: item.title ?? '',
      artist: item.artist?.name ?? (item.artists ?? []).map((a: any) => a.name).join(', '),
      album: item.album?.title ?? '',
      durationSec: typeof item.duration === 'number' ? item.duration : null,
    }));
  } catch {
    return [];
  }
}

// ─── Stream resolution ──────────────────────────────────────────────────────
// Best-to-worst — used by getBestTidalTrackUrl to always ask for the best
// quality this specific account is entitled to. Unlike Qobuz's format_id
// (where an ineligible tier comes back as an explicit sample:true/no-url
// response), Tidal's playbackinfopostpaywall endpoint silently downgrades to
// whatever the account's subscription actually supports — resp.audioQuality
// in the response reflects what was really granted, not necessarily what was
// requested — so this list exists mainly as a documented ceiling/fallback
// order rather than something every tier is individually probed against.
const QUALITY_PREFERENCE = ['HI_RES_LOSSLESS', 'LOSSLESS', 'HIGH', 'LOW'] as const;

interface StreamRespond {
  trackid: number;
  audioQuality: string;
  manifestMimeType: string;
  manifest: string;
}

// Ported from parse_mpd() in the Python reference (itself credited there to
// orpheusdl-tidal) — walks a DASH manifest's SegmentTemplate/SegmentTimeline
// to build the ordered list of segment URLs (init segment first) that make
// up one track. Tidal's DASH streams are always single-period/single-
// representation for audio, so only the first Representation found is used.
function parseMpd(xml: string): string[] {
  const stripped = xml.replace(/xmlns="[^"]+"/, '');

  const segTemplateMatch = stripped.match(/<SegmentTemplate\b([^>]*)>([\s\S]*?)<\/SegmentTemplate>/) ?? stripped.match(/<SegmentTemplate\b([^>]*)\/>/);
  if (!segTemplateMatch) return [];
  const attrs = segTemplateMatch[1];
  const body = segTemplateMatch[2] ?? '';

  const getAttr = (name: string): string | null => {
    const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : null;
  };

  const initialization = getAttr('initialization');
  const media = getAttr('media');
  const startNumber = parseInt(getAttr('startNumber') ?? '1', 10);
  if (!initialization || !media) return [];

  const urls: string[] = [initialization];

  const timelineMatch = body.match(/<SegmentTimeline>([\s\S]*?)<\/SegmentTimeline>/);
  if (timelineMatch) {
    const segTimeList: number[] = [];
    let curTime = 0;
    const sRegex = /<S\b([^/>]*)\/?>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(timelineMatch[1])) !== null) {
      const sAttrs = sMatch[1];
      const tMatch = sAttrs.match(/\bt="(\d+)"/);
      if (tMatch) curTime = parseInt(tMatch[1], 10);
      const rMatch = sAttrs.match(/\br="(\d+)"/);
      const dMatch = sAttrs.match(/\bd="(\d+)"/);
      const repeat = rMatch ? parseInt(rMatch[1], 10) : 0;
      const duration = dMatch ? parseInt(dMatch[1], 10) : 0;
      for (let i = 0; i < repeat + 1; i++) {
        segTimeList.push(curTime);
        curTime += duration;
      }
    }
    for (let n = startNumber; n < segTimeList.length + startNumber; n++) {
      urls.push(media.replace('$Number$', String(n)));
    }
  }

  return urls;
}

export interface TidalTrackStream {
  urls: string[];
  encryptionKey: string;
  quality: string;
}

// Resolves a playable stream for `trackId` at the best quality this
// session's account actually has — mirrors getStreamUrl() in the Python
// reference. Two manifest shapes come back from Tidal: a single-URL
// "vnd.tidal.bt" manifest (occasionally carrying an AES encryption key for
// old MQA masters — see decryptTidalFile below) or a multi-segment DASH
// ("dash+xml") manifest, parsed via parseMpd above. Either way this returns
// an ordered list of URLs to fetch and concatenate — a single-element array
// for the "bt" case, one-per-segment for DASH — so downloadTidalTrack below
// doesn't need to know which shape it got.
export async function getBestTidalTrackUrl(session: TidalSession, trackId: string): Promise<TidalTrackStream | null> {
  for (const quality of QUALITY_PREFERENCE) {
    const params = new URLSearchParams({
      audioquality: quality,
      playbackmode: 'STREAM',
      assetpresentation: 'FULL',
      countryCode: session.countryCode,
    });
    try {
      const res = await fetchWithTimeout(`${API_BASE}tracks/${trackId}/playbackinfopostpaywall?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) {
        // Temporary diagnostic: every quality tier has been failing for every
        // track since this provider launched, and the swallowed status/body
        // made it impossible to tell a 402/403 (no active subscription) apart
        // from a 401 (bad token/scope) or something else entirely — remove
        // once the real cause is confirmed from a live run.
        console.error(`[tidal] playbackinfopostpaywall ${quality} -> HTTP ${res.status} for track ${trackId} (countryCode="${session.countryCode}", userId="${session.userId}"): ${(await res.text()).slice(0, 300)}`);
        continue;
      }
      const resp = (await res.json()) as StreamRespond;
      if (!resp.manifest) {
        console.error(`[tidal] playbackinfopostpaywall ${quality} -> no manifest for track ${trackId}: ${JSON.stringify(resp).slice(0, 300)}`);
        continue;
      }

      if (resp.manifestMimeType?.includes('vnd.tidal.bt')) {
        const manifest = JSON.parse(Buffer.from(resp.manifest, 'base64').toString('utf8'));
        const url = manifest.urls?.[0];
        if (!url) continue;
        return { urls: [url], encryptionKey: manifest.keyId ?? '', quality: resp.audioQuality };
      }
      if (resp.manifestMimeType?.includes('dash+xml')) {
        const xml = Buffer.from(resp.manifest, 'base64').toString('utf8');
        const urls = parseMpd(xml);
        if (urls.length === 0) continue;
        return { urls, encryptionKey: '', quality: resp.audioQuality };
      }
      console.error(`[tidal] playbackinfopostpaywall ${quality} -> unrecognized manifestMimeType "${resp.manifestMimeType}" for track ${trackId}`);
    } catch (err) {
      console.error(`[tidal] playbackinfopostpaywall ${quality} -> request failed for track ${trackId}: ${(err as Error).message}`);
      continue;
    }
  }
  return null;
}

// ─── Download + legacy MQA decryption ──────────────────────────────────────
// Only ever exercised for the rare older "bt" manifest tracks that still
// carry a securityToken-derived encryption key — every DASH-manifest track
// (the vast majority today) has encryptionKey === '' and skips this
// entirely. Ported byte-for-byte from decryption.py's
// decrypt_security_token/decrypt_file (itself credited there to the RedSea
// project), swapping pycryptodome for Node's built-in crypto module.
function decryptSecurityToken(securityToken: string): { key: Buffer; nonce: Buffer } {
  // Fixed, not a secret worth hiding — same constant every Tidal client
  // ships with, purely there to decrypt the per-track key Tidal itself sends.
  const masterKey = Buffer.from('UIlTTEMmmLfGowo/UC60x2H45W6MdGgTRfo/umg4754=', 'base64');
  const token = Buffer.from(securityToken, 'base64');
  const iv = token.subarray(0, 16);
  const encrypted = token.subarray(16);

  const decipher = createDecipheriv('aes-128-cbc', masterKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return { key: decrypted.subarray(0, 16), nonce: decrypted.subarray(16, 24) };
}

function decryptAudioBuffer(data: Buffer, key: Buffer, nonce: Buffer): Buffer {
  // Matches pycryptodome's Counter.new(64, prefix=nonce, initial_value=0):
  // a 16-byte big-endian counter block = the 8-byte nonce followed by an
  // 8-byte counter starting at zero.
  const counterBlock = Buffer.concat([nonce, Buffer.alloc(8)]);
  const decipher = createDecipheriv('aes-128-ctr', key, counterBlock);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// Downloads every URL in `stream.urls` in order and concatenates them into
// `destPath` — for a DASH stream that's the init segment followed by every
// media segment (parseMpd already returns them in play order); for a "bt"
// stream it's just the one URL. Decrypts in place afterward if `encryptionKey`
// is set, same as __encrypted__ in the Python reference.
export async function downloadTidalTrack(stream: TidalTrackStream, destPath: string): Promise<void> {
  const chunks: Buffer[] = [];
  for (const url of stream.urls) {
    const res = await fetchWithTimeout(url, {}, DOWNLOAD_FETCH_TIMEOUT_MS);
    if (!res.ok || !res.body) throw new Error(`Tidal segment download failed: HTTP ${res.status}`);
    chunks.push(Buffer.from(await res.arrayBuffer()));
  }
  const combined = Buffer.concat(chunks);

  if (!stream.encryptionKey) {
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(destPath);
      ws.on('error', reject);
      ws.on('finish', resolve);
      ws.end(combined);
    });
    return;
  }

  const { key, nonce } = decryptSecurityToken(stream.encryptionKey);
  const decrypted = decryptAudioBuffer(combined, key, nonce);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(destPath);
    ws.on('error', reject);
    ws.on('finish', resolve);
    ws.end(decrypted);
  });
}
