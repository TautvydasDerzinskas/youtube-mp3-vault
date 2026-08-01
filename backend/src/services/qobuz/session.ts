// Reworked port of a standalone qobuz_module prototype's communitySession.ts
// (itself ported from SpotiFLAC's community_session.go + community_apikey.go
// — SpotiFLAC being the open-source Spotify/Tidal/Qobuz downloader this
// whole fallback source's protocol is ported from). Neither of those is part
// of this repo.
//
// Architecture: the community backend's one-time verification step is a real
// Cloudflare Turnstile challenge (a live, actively-maintained anti-bot
// product) that a headless, unattended browser cannot reliably pass — this
// was tried (see git history / demo-page/) and Turnstile's risk engine
// consistently declined the automated session even after clicking the
// checkbox. There's no way around that other than a real human completing it
// in a real browser, so this backend doesn't attempt automation at all:
// instead it hands the challenge URL to an opted-in user's own browser (see
// routes/hq.ts's /status endpoint, polled by the frontend/mobile) and waits
// for that real browser to complete the challenge and hit the real callback
// route (/api/hq/qobuz/callback, also in routes/hq.ts) with the resulting
// grant. This is why Qobuz HQ discovery is an opt-in per-user setting
// (User.qobuzHqEnabled) rather than a silent background feature — completing
// it needs a live person occasionally.
//
// Nothing here ever blocks a background job on that human interaction:
// ensureCommunitySession() kicks off the (fast) bootstrap call to obtain a
// fresh challenge URL if needed and then throws immediately — the current
// HQ scan attempt just skips Qobuz for this track, and a later attempt
// (next track, next sync) succeeds once verification completes.
//
// The actual cryptographic protocol against the community backend (HMAC
// request signing, rolling session keys, the bootstrap/exchange calls) is
// unchanged from the prototype.
import crypto from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../../config';
import { ensureQobuzDataDir } from './appDir';
import { getCommunityVerifyURL } from './communityEndpoints';
import { QOBUZ_USER_AGENT } from './credentials';

const COMMUNITY_SESSION_SKEW_MS = 5 * 60 * 1000;
// How long a challenge URL stays valid for a user to click through before a
// fresh one is requested instead — generous, since "a human notices the
// popup and clicks it" is a much slower clock than any browser-automation
// timeout ever needed to be.
const PENDING_VERIFICATION_TTL_MS = 10 * 60 * 1000;

// Mirrors SpotiFLAC's wails.json productVersion, same as the prototype this
// was ported from — bump if SpotiFLAC's own release version moves on and
// requests start failing (the community backend may pin behavior to it).
export const APP_VERSION = '7.2.0';

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

// Called once at backend startup (see index.ts) so a broken verify-endpoint
// decrypt shows up immediately in `docker logs` rather than only surfacing
// days later when a weekly sync's HQ fallback first needs it.
export async function logQobuzStartupStatus(): Promise<void> {
  if (!getCommunityVerifyURL()) {
    console.warn('[qobuz] Community verify endpoint is unavailable (decrypt failure?) — Qobuz HQ discovery will not work.');
    return;
  }
  console.log('[qobuz] HQ fallback ready — verification (when needed) is completed by an opted-in user in their own browser.');
}

interface PendingVerification {
  state: string;
  challengeUrl: string;
  record: SessionRecord;
  createdAt: number;
}

let pendingVerification: PendingVerification | null = null;
let bootstrapInFlight: Promise<void> | null = null;

function pendingIsFresh(p: PendingVerification | null): p is PendingVerification {
  return !!p && Date.now() - p.createdAt < PENDING_VERIFICATION_TTL_MS;
}

function buildCallbackUrl(state: string): string {
  return `${config.frontendUrl}/api/hq/qobuz/callback?state=${state}`;
}

// Fetches a fresh challenge URL from the community backend (a plain, fast
// HTTP round-trip — no browser involved) and stores it as the pending
// verification any opted-in user's client can pick up via /api/hq/qobuz/status.
// No-ops if a still-fresh pending challenge already exists, or if a bootstrap
// request is already in flight (concurrent callers share it).
async function startVerificationIfNeeded(record: SessionRecord): Promise<void> {
  if (pendingIsFresh(pendingVerification)) return;
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    try {
      const verifyBaseURL = getCommunityVerifyURL();
      if (!verifyBaseURL) throw new Error('verification endpoint is unavailable');

      const bootstrapURL = new URL(verifyBaseURL + '/bootstrap');
      bootstrapURL.searchParams.set('install_id', record.install_id);
      bootstrapURL.searchParams.set('app_version', APP_VERSION);
      bootstrapURL.searchParams.set('platform', 'desktop');

      console.log(`[qobuz] Requesting a verification challenge (install_id=${record.install_id})`);
      const resp = await fetch(bootstrapURL, {
        headers: { 'User-Agent': QOBUZ_USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`verification bootstrap returned HTTP ${resp.status}`);
      const body = (await resp.json()) as { challenge_url?: string };
      const parsed = body.challenge_url ? new URL(body.challenge_url) : null;
      if (!parsed || parsed.protocol !== 'https:') {
        throw new Error('verification service returned an invalid challenge URL');
      }

      const state = randomHex(8);
      parsed.searchParams.set('cb', buildCallbackUrl(state));
      pendingVerification = { state, challengeUrl: parsed.toString(), record, createdAt: Date.now() };
      console.log('[qobuz] Verification challenge ready — waiting for an opted-in user to complete it in their browser');
    } catch (err) {
      console.error('[qobuz] Failed to request a verification challenge:', err instanceof Error ? err.message : String(err));
    } finally {
      bootstrapInFlight = null;
    }
  })();

  return bootstrapInFlight;
}

// Returns the currently pending challenge URL, if any (and not expired) —
// used by routes/hq.ts's /status endpoint to hand it to an opted-in user's
// client for display. Null when nothing needs verifying right now.
export function getPendingVerificationChallengeUrl(): string | null {
  return pendingIsFresh(pendingVerification) ? pendingVerification.challengeUrl : null;
}

// Called by routes/hq.ts's public /callback route once a real user's browser
// has completed the Turnstile challenge and been redirected here with a
// grant. Exchanges it for a session and persists it — after this,
// ensureCommunitySession() below starts succeeding again.
export async function completeVerification(state: string, grant: string): Promise<void> {
  if (!pendingIsFresh(pendingVerification) || pendingVerification.state !== state) {
    throw new Error('no matching pending verification (it may have expired, or already been completed)');
  }
  const record = pendingVerification.record;
  pendingVerification = null;

  const verifyBaseURL = getCommunityVerifyURL();
  if (!verifyBaseURL) throw new Error('verification endpoint is unavailable');

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
    throw new Error(`session exchange returned HTTP ${exchangeResp.status}`);
  }
  const exchanged = (await exchangeResp.json()) as {
    session_id?: string;
    session_secret?: string;
    expires_at?: string;
  };
  if (!exchanged.session_id || !exchanged.session_secret || !exchanged.expires_at) {
    throw new Error('session exchange response is incomplete');
  }

  record.session_id = exchanged.session_id;
  record.session_secret = exchanged.session_secret;
  record.expires_at = exchanged.expires_at;
  await saveSession(record);
  console.log(`[qobuz] Verification succeeded — session valid until ${exchanged.expires_at}`);
}

// Returns the cached session if still valid. Otherwise kicks off (or reuses)
// a pending verification challenge and throws — never blocks waiting for a
// human. Callers (see client.ts) already treat any failure here as "skip
// Qobuz for this track, try again next time", which is exactly right: the
// next call after a user completes the popup will succeed.
export async function ensureCommunitySession(): Promise<CommunitySession> {
  const record = await loadSession();
  if (isSessionValid(record)) {
    return { sessionId: record.session_id, sessionSecret: record.session_secret };
  }

  await startVerificationIfNeeded(record);
  throw new Error('Qobuz verification required — waiting for an opted-in user to complete it');
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
