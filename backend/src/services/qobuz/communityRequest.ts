// Ported from the standalone qobuz_module prototype (not part of this repo) — its src/server/communityRequest.ts (itself ported
// from doCommunityRequest in SpotiFLAC's community_endpoints.go).
import { QOBUZ_USER_AGENT } from './credentials';
import { ensureCommunitySession, signCommunityRequest, clearCommunitySessionCredentials } from './session';
import {
  CommunityCooldownError,
  setCommunityCooldown,
  clearCommunityCooldown,
  setRateLimitCooldown,
  clearRateLimitCooldown,
} from './communityStatus';

const MAX_RETRIES = 6;
const FALLBACK_WAIT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(resp: Response): number {
  const ra = resp.headers.get('retry-after');
  if (ra) {
    const secs = Number.parseInt(ra, 10);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000 + 250;
  }
  const reset = resp.headers.get('x-ratelimit-reset');
  if (reset) {
    const epoch = Number.parseInt(reset, 10);
    if (Number.isFinite(epoch)) {
      const wait = epoch * 1000 - Date.now();
      if (wait > 0) return wait + 250;
    }
  }
  return FALLBACK_WAIT_MS;
}

/**
 * POSTs a JSON body to a community endpoint, signing the request with the
 * current session and retrying transient failures the same way SpotiFLAC's
 * own client does (429/502/504 backoff, 401/428 re-verify once, 503 = cooldown).
 */
export async function doCommunityRequest(service: string, urlString: string, body: Buffer): Promise<Response> {
  let verificationRetried = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const session = await ensureCommunitySession();
    const url = new URL(urlString);
    const signed = signCommunityRequest('POST', url.pathname, body, session);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': QOBUZ_USER_AGENT,
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        ...signed,
      },
      body,
    });

    if (resp.status === 503) {
      clearRateLimitCooldown();
      let message = '';
      let seconds = 0;
      const ra = resp.headers.get('retry-after');
      if (ra) {
        const secs = Number.parseInt(ra, 10);
        if (Number.isFinite(secs) && secs > 0) seconds = secs;
      }
      try {
        const parsed = (await resp.json()) as { error?: string };
        message = parsed.error?.trim() ?? '';
      } catch {
        // ignore unparsable body
      }
      if (seconds <= 0) seconds = FALLBACK_WAIT_MS / 1000;
      if (!message) {
        message = `The server is taking a scheduled short break. Please try again in about ${Math.max(1, Math.ceil(seconds / 60))} minute(s).`;
      }
      console.warn(`[qobuz] ${service} community backend on cooldown for ~${seconds}s: ${message}`);
      setCommunityCooldown(seconds, message);
      throw new CommunityCooldownError(service, seconds);
    }

    if ((resp.status === 401 || resp.status === 428) && !verificationRetried) {
      console.warn(`[qobuz] ${service} community backend returned HTTP ${resp.status} — session likely stale, re-verifying once`);
      await clearCommunitySessionCredentials();
      verificationRetried = true;
      attempt -= 1;
      continue;
    }

    if (resp.status !== 429 && resp.status !== 502 && resp.status !== 504) {
      clearRateLimitCooldown();
      clearCommunityCooldown();
      return resp;
    }

    let wait: number;
    if (resp.status === 429) {
      wait = retryAfterMs(resp);
    } else {
      wait = (attempt + 1) * 5000;
    }

    if (attempt === MAX_RETRIES) {
      console.error(`[qobuz] ${service} community backend still returning HTTP ${resp.status} after ${MAX_RETRIES} retries — giving up`);
      throw new Error(`${service} community API returned ${resp.status} after ${MAX_RETRIES} retries`);
    }
    console.warn(`[qobuz] ${service} community backend returned HTTP ${resp.status} — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
    setRateLimitCooldown(wait / 1000);
    await sleep(wait);
    clearRateLimitCooldown();
  }

  throw new Error(`${service} community API request failed`);
}
