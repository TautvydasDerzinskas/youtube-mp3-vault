// Reworked port of a standalone qobuz_module prototype's communitySession.ts
// (itself ported from SpotiFLAC's community_session.go + community_apikey.go
// — SpotiFLAC being the open-source Spotify/Tidal/Qobuz downloader this
// whole fallback source's protocol is ported from). Neither of those is part
// of this repo.
//
// Architecture change from that source: the verify step isn't a plain HTTP
// redirect — the challenge page runs its own JS (a polling animation) before
// navigating to the `cb` callback URL with the grant, so it needs something
// that can actually execute that JS. SpotiFLAC's Go app handles this by
// shelling out to the OS's real browser and blocking on a *localhost* HTTP
// callback; the prototype this was ported from does the same via the
// admin's own browser (window.open + polling). Neither works unattended:
// this backend runs in a container with no human sitting in front of it, so
// there'd be nobody to open a browser at all, let alone click through one.
// Instead, this launches a real (headless) Chromium itself — see
// extractGrantViaHeadlessBrowser below — navigates it to the challenge page, and
// intercepts *that browser's own* outgoing request to a synthetic `cb` URL
// (playwright-core's request routing, never an actual network call) to pull
// the grant out, mirroring exactly what a real callback server would've
// caught, just inside the same process instead of a human's machine. No
// admin interaction, no new port, no public route.
//
// The actual cryptographic protocol against the community backend (HMAC
// request signing, rolling session keys, the bootstrap/exchange calls) is
// unchanged.
import crypto from 'crypto';
import { access, constants, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { chromium } from 'playwright-core';
import { config } from '../../config';
import { ensureQobuzDataDir } from './appDir';
import { getCommunityVerifyURL } from './communityEndpoints';

const COMMUNITY_SESSION_SKEW_MS = 5 * 60 * 1000;
const COMMUNITY_VERIFY_TIMEOUT_MS = 2 * 60 * 1000;

// Mirrors SpotiFLAC's wails.json productVersion, same as the prototype this
// was ported from — bump if SpotiFLAC's own release version moves on and
// requests start failing (the community backend may pin behavior to it).
export const APP_VERSION = '7.2.0';

// Never actually dialed — playwright-core intercepts any request starting
// with this prefix and resolves the grant from it before the request would
// otherwise go out over the (nonexistent) network. Just needs to be a
// syntactically valid https URL the community backend will accept as a
// redirect target.
const SYNTHETIC_CALLBACK_URL = 'https://qobuz-verify.ympv.internal/callback';

interface SessionRecord {
  install_id: string;
  session_id?: string;
  session_secret?: string;
  expires_at?: string;
}

interface CommunitySession {
  sessionId: string;
  sessionSecret: string;
}

async function sessionPath(): Promise<string> {
  return join(await ensureQobuzDataDir(), 'community_session.json');
}

function randomHex(size: number): string {
  return crypto.randomBytes(size).toString('hex');
}

async function loadSession(): Promise<SessionRecord> {
  let record: SessionRecord = { install_id: '' };
  try {
    record = JSON.parse(await readFile(await sessionPath(), 'utf8'));
  } catch {
    // missing/corrupt file — fall through to minting a fresh install id below
  }
  if (!record.install_id) {
    record.install_id = randomHex(16);
    await saveSession(record);
  }
  return record;
}

async function saveSession(record: SessionRecord): Promise<void> {
  await writeFile(await sessionPath(), JSON.stringify(record, null, 2), { mode: 0o600 });
}

function isSessionValid(record: SessionRecord): record is Required<Pick<SessionRecord, 'session_id' | 'session_secret' | 'expires_at'>> & SessionRecord {
  if (!record.session_id || !record.session_secret || !record.expires_at) return false;
  const expiresAt = Date.parse(record.expires_at);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() > COMMUNITY_SESSION_SKEW_MS;
}

export async function clearCommunitySessionCredentials(): Promise<void> {
  console.warn('[qobuz] Community backend rejected the cached session (401/428) — clearing it, next attempt will re-verify');
  const record = await loadSession();
  record.session_id = undefined;
  record.session_secret = undefined;
  record.expires_at = undefined;
  await saveSession(record);
}

// Called once at backend startup (see index.ts) so a missing/broken headless
// Chromium shows up immediately in `docker logs` rather than only surfacing
// days later when a weekly sync's HQ fallback first needs it.
export async function logQobuzStartupStatus(): Promise<void> {
  if (!config.qobuzChromiumPath) {
    console.warn(
      '[qobuz] QOBUZ_CHROMIUM_PATH is not set — the Qobuz HQ fallback will fail verification (and silently ' +
      'contribute nothing) whenever slskd has no match. Expected in a bare local dev run; should always be ' +
      'set in the Docker image (see Dockerfile).',
    );
    return;
  }
  try {
    await access(config.qobuzChromiumPath, constants.X_OK);
    console.log(`[qobuz] Headless Chromium found at ${config.qobuzChromiumPath} — HQ fallback ready.`);
  } catch {
    console.warn(
      `[qobuz] QOBUZ_CHROMIUM_PATH is set to "${config.qobuzChromiumPath}" but that path isn't an executable ` +
      'file — the Qobuz HQ fallback will fail verification until this is fixed (check the installed chromium ' +
      'package/binary name matches).',
    );
  }
}

// Launches headless Chromium, navigates it to the community verify site's
// challenge page, and waits for that page's own JS (the polling "bubble
// turns green" animation) to finish and navigate to SYNTHETIC_CALLBACK_URL
// with the grant — caught via playwright-core's request routing before it
// would otherwise try (and fail) to actually dial that host. Closes the
// browser unconditionally afterward either way.
async function extractGrantViaHeadlessBrowser(challengeUrl: string): Promise<string> {
  if (!config.qobuzChromiumPath) {
    console.error('[qobuz] Cannot run headless verification — QOBUZ_CHROMIUM_PATH is not set');
    throw new Error('Headless Chromium is not configured (QOBUZ_CHROMIUM_PATH) — cannot complete Qobuz verification');
  }

  console.log(`[qobuz] Launching headless Chromium (${config.qobuzChromiumPath})`);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: config.qobuzChromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    console.error(
      `[qobuz] Failed to launch headless Chromium at "${config.qobuzChromiumPath}" — check the binary exists ` +
      'and the image has its runtime deps installed (nss/freetype/harfbuzz/ca-certificates/ttf-freefont):',
      (err as Error).message,
    );
    throw err;
  }

  try {
    const page = await browser.newPage();

    let grantResolve!: (grant: string) => void;
    let grantReject!: (err: Error) => void;
    const grantPromise = new Promise<string>((resolve, reject) => {
      grantResolve = resolve;
      grantReject = reject;
    });

    await page.route(
      (url) => url.href.startsWith(SYNTHETIC_CALLBACK_URL),
      async (route) => {
        const grant = new URL(route.request().url()).searchParams.get('grant');
        console.log(`[qobuz] Verification callback intercepted — grant ${grant ? 'received' : 'MISSING'}`);
        // Respond instead of aborting so the page's own JS doesn't see a
        // network error and retry/loop — matches the "Verified" page the
        // real callback used to serve.
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Verified</title>' });
        if (grant) grantResolve(grant);
        else grantReject(new Error('verification callback carried no grant'));
      },
    );

    console.log(`[qobuz] Navigating headless browser to challenge page: ${challengeUrl}`);
    // Only waits for the challenge page's *initial* load — the later
    // navigation to SYNTHETIC_CALLBACK_URL (once its own JS finishes
    // polling) is caught by the route handler above, not by this call.
    page.goto(challengeUrl, { waitUntil: 'domcontentloaded', timeout: COMMUNITY_VERIFY_TIMEOUT_MS }).catch((err) => {
      // A failure loading the initial page doesn't necessarily mean
      // verification failed outright — the timeout race below is the real
      // guard either way — but it's worth logging in case it's the actual
      // root cause (e.g. DNS failure reaching the challenge host at all).
      console.warn('[qobuz] Challenge page navigation reported an error (may be harmless):', (err as Error).message);
    });

    const grant = await Promise.race([
      grantPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`verification timed out after ${COMMUNITY_VERIFY_TIMEOUT_MS / 1000}s waiting for the challenge page to complete`)), COMMUNITY_VERIFY_TIMEOUT_MS),
      ),
    ]);
    console.log('[qobuz] Headless verification page completed successfully');
    return grant;
  } catch (err) {
    console.error('[qobuz] Headless verification failed:', (err as Error).message);
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function performVerification(record: SessionRecord): Promise<CommunitySession> {
  const verifyBaseURL = getCommunityVerifyURL();
  if (!verifyBaseURL) {
    console.error('[qobuz] Community verify endpoint is unavailable (decrypt failure?) — cannot verify');
    throw new Error('verification endpoint is unavailable');
  }

  const bootstrapURL = new URL(verifyBaseURL + '/bootstrap');
  bootstrapURL.searchParams.set('install_id', record.install_id);
  bootstrapURL.searchParams.set('app_version', APP_VERSION);
  bootstrapURL.searchParams.set('platform', 'desktop');

  console.log(`[qobuz] Requesting verification challenge (install_id=${record.install_id})`);
  const bootstrapResp = await fetch(bootstrapURL, { signal: AbortSignal.timeout(15_000) });
  if (!bootstrapResp.ok) {
    console.error(`[qobuz] Bootstrap request failed: HTTP ${bootstrapResp.status}`);
    throw new Error(`verification bootstrap returned HTTP ${bootstrapResp.status}`);
  }
  const bootstrapBody = (await bootstrapResp.json()) as { challenge_url?: string };
  const parsed = bootstrapBody.challenge_url ? new URL(bootstrapBody.challenge_url) : null;
  if (!parsed || parsed.protocol !== 'https:') {
    console.error('[qobuz] Bootstrap response had no usable challenge_url:', JSON.stringify(bootstrapBody));
    throw new Error('verification service returned an invalid challenge URL');
  }
  parsed.searchParams.set('cb', SYNTHETIC_CALLBACK_URL);

  const grant = await extractGrantViaHeadlessBrowser(parsed.toString());

  console.log('[qobuz] Exchanging grant for a session');
  const exchangeResp = await fetch(verifyBaseURL + '/session/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant,
      install_id: record.install_id,
      app_version: APP_VERSION,
      platform: 'desktop',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!exchangeResp.ok) {
    console.error(`[qobuz] Session exchange failed: HTTP ${exchangeResp.status}`);
    throw new Error(`session exchange returned HTTP ${exchangeResp.status}`);
  }
  const exchanged = (await exchangeResp.json()) as {
    session_id?: string;
    session_secret?: string;
    expires_at?: string;
  };
  if (!exchanged.session_id || !exchanged.session_secret || !exchanged.expires_at) {
    console.error('[qobuz] Session exchange response was incomplete:', JSON.stringify(exchanged));
    throw new Error('session exchange response is incomplete');
  }

  record.session_id = exchanged.session_id;
  record.session_secret = exchanged.session_secret;
  record.expires_at = exchanged.expires_at;
  await saveSession(record);
  console.log(`[qobuz] Verification succeeded — session valid until ${exchanged.expires_at}`);
  return { sessionId: exchanged.session_id, sessionSecret: exchanged.session_secret };
}

let pending: Promise<CommunitySession> | null = null;

// Transparently completes the full headless verification inline the first
// time it's needed (or whenever a past session has expired/been revoked —
// see clearCommunitySessionCredentials) and returns the now-valid session.
// Concurrent callers (e.g. several tracks in the same HQ scan pass) share
// the one in-flight attempt rather than each launching their own browser.
// Blocks for however long the headless verification takes (up to
// COMMUNITY_VERIFY_TIMEOUT_MS) only on that first call — every call after a
// session is cached returns near-instantly.
export async function ensureCommunitySession(): Promise<CommunitySession> {
  const record = await loadSession();
  if (isSessionValid(record)) {
    return { sessionId: record.session_id, sessionSecret: record.session_secret };
  }

  if (!pending) {
    console.log('[qobuz] Session missing or expired — starting headless verification');
    pending = performVerification(record).finally(() => {
      pending = null;
    });
  } else {
    console.log('[qobuz] Verification already in progress — reusing the in-flight attempt');
  }
  return pending;
}

function communityUserAgent(): string {
  return `YoutubeVault-qobuz/${APP_VERSION}`;
}

export function signCommunityRequest(method: string, urlPath: string, body: Buffer, session: CommunitySession): Record<string, string> {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const timestamp = new Date().toISOString();
  const nonce = randomHex(12);
  const windowIdx = Math.floor(Date.parse(timestamp) / 1000 / 300);
  const rollingInput = `${windowIdx}:${session.sessionId}`;
  const rollingKey = crypto.createHmac('sha256', session.sessionSecret).update(rollingInput).digest();
  const signingInput = [
    'SPOTIFLAC-HMAC-V1',
    method.toUpperCase(),
    urlPath,
    '',
    bodyHash,
    timestamp,
    nonce,
    session.sessionId,
    APP_VERSION,
    'desktop',
  ].join('\n');
  const signature = crypto.createHmac('sha256', rollingKey).update(signingInput).digest('base64url');

  return {
    'X-Sig-Session': session.sessionId,
    'X-Sig-Timestamp': timestamp,
    'X-Sig-Nonce': nonce,
    'X-Sig-Body-SHA256': bodyHash,
    'X-Sig-Signature': signature,
    'X-Sig-App-Version': APP_VERSION,
    'X-Sig-Platform': 'desktop',
    'User-Agent': communityUserAgent(),
  };
}
