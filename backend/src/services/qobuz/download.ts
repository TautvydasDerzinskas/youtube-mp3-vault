// Ported verbatim from the standalone qobuz_module prototype (not part of this repo) — its src/server/qobuzDownload.ts (itself
// ported from SpotiFLAC's qobuz_community.go getQobuzCommunityDownloadURL
// and the streaming-URL-extraction helpers in qobuz.go).
import { getQobuzCommunityDownloadURL } from './communityEndpoints';
import { doCommunityRequest } from './communityRequest';

function mapQualityToCommunity(quality: string): '24' | '16' {
  const q = quality.trim();
  return q === '27' || q === '7' ? '24' : '16';
}

function looksStreamable(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host !== '';
  } catch {
    return false;
  }
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\\]+/g;

function findStreamingURLInPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    const candidate = payload.replaceAll('\\/', '/').trim();
    return looksStreamable(candidate) ? candidate : '';
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findStreamingURLInPayload(item);
      if (found) return found;
    }
    return '';
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['download_url', 'url', 'play_url', 'stream_url', 'link', 'file']) {
      if (key in obj) {
        const found = findStreamingURLInPayload(obj[key]);
        if (found) return found;
      }
    }
    for (const value of Object.values(obj)) {
      const found = findStreamingURLInPayload(value);
      if (found) return found;
    }
  }
  return '';
}

export function extractQobuzStreamingURL(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';

  try {
    const direct = JSON.parse(trimmed) as {
      url?: string;
      download_url?: string;
      data?: { url?: string; download_url?: string };
    };
    for (const candidate of [direct.download_url, direct.url, direct.data?.download_url, direct.data?.url]) {
      if (candidate && looksStreamable(candidate)) return candidate;
    }
  } catch {
    // not direct-shape JSON, fall through
  }

  try {
    const generic = JSON.parse(trimmed);
    const found = findStreamingURLInPayload(generic);
    if (found) return found;
  } catch {
    // not JSON at all, fall through to JSONP/regex handling below
  }

  const openIdx = trimmed.indexOf('(');
  const closeIdx = trimmed.lastIndexOf(')');
  if (openIdx >= 0 && closeIdx > openIdx + 1) {
    const callbackBody = trimmed.slice(openIdx + 1, closeIdx).trim();
    const found = extractQobuzStreamingURL(callbackBody);
    if (found) return found;
  }

  for (const match of trimmed.matchAll(URL_PATTERN)) {
    const candidate = match[0].replaceAll('\\/', '/');
    if (looksStreamable(candidate)) return candidate;
  }

  return '';
}

export async function getQobuzCommunityDownloadURLFor(trackId: number, quality: string): Promise<string> {
  const payload = Buffer.from(JSON.stringify({ id: String(trackId), quality: mapQualityToCommunity(quality) }));
  const resp = await doCommunityRequest('Qobuz', getQobuzCommunityDownloadURL(), payload);

  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(`qobuz community API returned status ${resp.status}`);
  }

  const downloadURL = extractQobuzStreamingURL(body);
  if (!downloadURL) {
    throw new Error('no streamable URL in qobuz community response');
  }
  return downloadURL;
}
