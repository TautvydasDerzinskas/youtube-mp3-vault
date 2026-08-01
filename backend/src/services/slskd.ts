import { isOnline } from './connectivity';
import { config } from '../config';

// A search's responses trickle in from other Soulseek peers over a few
// seconds — this is how long we're willing to wait for it to settle before
// reading back whatever's arrived so far, not a per-request network timeout.
const SEARCH_SETTLE_TIMEOUT_MS = 8_000;
const SEARCH_POLL_INTERVAL_MS = 1_000;
// Per-HTTP-call timeout against the slskd (or slskd-compatible) daemon
// itself — a stalled request here shouldn't hang the calling sync pass's
// quality-check step forever (see slskdQualityWorker.ts/hqReplace.ts), same
// rationale as every other third-party fetch in this app.
const SLSKD_FETCH_TIMEOUT_MS = 15_000;

// Standard mp3 encoding bitrates top out at 320kbps — anything reported above
// that from a Soulseek peer is a bogus/unparseable value, not a genuine
// higher-quality file, so it's excluded rather than trusted as an upgrade.
export const MAX_PLAUSIBLE_MP3_BITRATE_KBPS = 320;

// Extensions treated as lossless Soulseek results — always a real quality
// win over any mp3 we could already have, so they're matched independently
// of currentBitrate. downloadAndReplace (hqReplace.ts) transcodes these down
// to a 320kbps mp3 rather than storing them as-is, since this app's library
// is mp3-only throughout.
export const LOSSLESS_EXTENSIONS = ['.flac', '.wav'];

export interface SlskdFile {
  filename: string;
  size: number;
  bitRate: number | null;
  // Track length in seconds, per slskd's own File model (Soulseek protocol
  // field) — not every peer's client reports it, so this is nullable, but
  // when present it's a useful corroborating signal for hqReplace.ts's
  // duration-proximity match tiers.
  length: number | null;
}

export interface SlskdSearchResponse {
  username: string;
  files: SlskdFile[];
}

export interface SlskdClientConfig {
  baseUrl: string;
  apiKey: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Low-level REST client, parameterized by base URL + API key — in practice
// there's only ever one instance of this (see slskdClient below), but
// keeping the plumbing parameterized rather than reading config.* directly
// keeps it testable/reusable without duplicating the HTTP logic.
export function createSlskdClient({ baseUrl, apiKey }: SlskdClientConfig) {
  async function slskdFetch(path: string, init: RequestInit = {}): Promise<any | null> {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(SLSKD_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      if (res.status === 204) return {};
      return await res.json();
    } catch {
      return null;
    }
  }

  async function search(searchText: string): Promise<{ id: string; responses: SlskdSearchResponse[] } | null> {
    const started = await slskdFetch('/api/v0/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchText }),
    });
    const searchId = started?.id;
    if (!searchId) return null;

    try {
      const deadline = Date.now() + SEARCH_SETTLE_TIMEOUT_MS;
      let status = started;
      while (Date.now() < deadline && !status?.isComplete) {
        await sleep(SEARCH_POLL_INTERVAL_MS);
        status = await slskdFetch(`/api/v0/searches/${searchId}`);
        if (!status) break;
      }

      const responses = await slskdFetch(`/api/v0/searches/${searchId}/responses`);
      return { id: searchId, responses: Array.isArray(responses) ? responses : [] };
    } finally {
      // Best-effort cleanup so the service's search history doesn't
      // accumulate one entry per track ever synced — failure here is
      // harmless either way.
      await slskdFetch(`/api/v0/searches/${searchId}`, { method: 'DELETE' });
    }
  }

  // Enqueues a download from a specific peer/username for one or more files
  // (as returned by a search response) — POST /api/v0/transfers/downloads/{username}
  // per slskd's real REST API (verified against its source: TransfersController.EnqueueAsync).
  // `metadata` is not part of stock slskd's request shape — it's there for a
  // modified slskd-compatible image (see hqReplace.ts) that gates downloads
  // on a purchaser IP, and is simply ignored by a real slskd instance.
  async function enqueueDownload(
    username: string,
    files: Array<{ filename: string; size: number }>,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const body = files.map((f) => (metadata ? { ...f, metadata } : f));
    const result = await slskdFetch(`/api/v0/transfers/downloads/${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return result !== null;
  }

  // All in-flight/completed downloads for a given peer — used to poll a
  // just-enqueued download's state (there's no way to learn its transfer id
  // directly from the enqueue response), matching slskd's real
  // GET /api/v0/transfers/downloads/{username} shape.
  async function getUserDownloads(username: string): Promise<any[]> {
    const result = await slskdFetch(`/api/v0/transfers/downloads/${encodeURIComponent(username)}`);
    const directories: any[] = result?.directories ?? [];
    return directories.flatMap((d) => d?.files ?? []);
  }

  return { search, enqueueDownload, getUserDownloads };
}

export function isSlskdConfigured(): boolean {
  return Boolean(config.slskdUrl && config.slskdApiKey);
}

// Single shared client for our one self-hosted slskd(-compatible) instance —
// used directly by findBetterQualityMp3 below, and reused by
// services/hqReplace.ts for the auto-download path when that's enabled, so
// both talk to the same container rather than constructing their own.
export const slskdClient = createSlskdClient({ baseUrl: config.slskdUrl, apiKey: config.slskdApiKey });

// Searches our self-hosted slskd for this track and returns the highest mp3
// bitrate found among the results, if it beats what we already have.
// Soulseek results can be flac/wav/whatever a peer happens to share —
// deliberately only .mp3 filenames are considered, per the ask being
// specifically about a better mp3, not just "any higher bitrate file".
// Best-effort only: a filename match here isn't a verified same-recording
// match, just a plausible one (same as MusicBrainz's own scored search), so
// this never blocks or affects the download itself, and never downloads
// anything — see hqReplace.ts for the auto-download path that does, gated
// on the admin's "auto-download HQ upgrades" toggle.
export async function findBetterQualityMp3(
  artist: string,
  title: string,
  currentBitrate: number | null,
): Promise<number | null> {
  if (!isOnline() || !isSlskdConfigured()) return null;

  const searchText = `${artist} ${title}`.trim();
  if (!searchText) return null;

  const result = await slskdClient.search(searchText);
  if (!result) return null;

  let bestBitrate = 0;
  let hasLossless = false;
  for (const response of result.responses) {
    for (const file of response.files ?? []) {
      const filename = file?.filename ?? '';
      const lower = filename.toLowerCase();
      if (LOSSLESS_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        hasLossless = true;
        continue;
      }
      if (!lower.endsWith('.mp3')) continue;
      const bitrate = Number(file?.bitRate ?? 0);
      if (!Number.isFinite(bitrate) || bitrate <= 0 || bitrate > MAX_PLAUSIBLE_MP3_BITRATE_KBPS) continue;
      if (bitrate > bestBitrate) bestBitrate = bitrate;
    }
  }

  // A lossless peer file always beats whatever mp3 we currently have — an
  // auto-download would transcode it down to a 320kbps mp3 (hqReplace.ts),
  // so it's reported as that effective ceiling rather than left out just
  // because "bitrate" isn't a meaningful concept for a lossless file.
  if (hasLossless) return MAX_PLAUSIBLE_MP3_BITRATE_KBPS;
  if (bestBitrate === 0) return null;
  if (currentBitrate !== null && bestBitrate <= currentBitrate) return null;
  return bestBitrate;
}
