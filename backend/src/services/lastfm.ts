import { createHash } from 'crypto';
import { isOnline } from './connectivity';
import { getLastfmSettings } from './settings';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
// Small JSON API call, not a file transfer — a stalled request would
// otherwise hang the calling pass (sync's metadata step, playlist
// generation, scrobbling) forever. An abort here is already handled the
// same as any other failure below (falls through to the existing catch).
const LASTFM_FETCH_TIMEOUT_MS = 15_000;

export interface SimilarTrack {
  artist: string;
  title: string;
  matchScore: number;
}

export async function getSimilarTracks(artist: string, title: string, limit = 8): Promise<SimilarTrack[]> {
  const { apiKey } = getLastfmSettings();
  if (!apiKey || !isOnline()) return [];
  if (!artist.trim() || !title.trim()) return [];

  const params = new URLSearchParams({
    method: 'track.getsimilar',
    artist,
    track: title,
    api_key: apiKey,
    autocorrect: '1',
    limit: String(limit),
    format: 'json',
  });

  try {
    const res = await fetch(`${LASTFM_BASE}?${params.toString()}`, { signal: AbortSignal.timeout(LASTFM_FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data: any = await res.json();
    const tracks: any[] = data?.similartracks?.track ?? [];
    return tracks
      .map((t): SimilarTrack | null => {
        const trackArtist = t?.artist?.name;
        const trackTitle = t?.name;
        if (!trackArtist || !trackTitle) return null;
        return { artist: trackArtist, title: trackTitle, matchScore: Number(t?.match ?? 0) };
      })
      .filter((t): t is SimilarTrack => t !== null);
  } catch {
    return [];
  }
}

export interface TrackCorrection {
  artist: string;
  title: string;
}

// Used as a last-resort fallback when MusicBrainz has no match: hands Last.fm
// our best local guess at artist/title and asks it to correct it against its
// own catalog (spelling, canonical capitalization, etc). Requires both an
// artist and a title — Last.fm's track.getcorrection doesn't accept title-only.
export async function getTrackCorrection(artist: string, title: string): Promise<TrackCorrection | null> {
  const { apiKey } = getLastfmSettings();
  if (!apiKey || !isOnline()) return null;
  if (!artist.trim() || !title.trim()) return null;

  const params = new URLSearchParams({
    method: 'track.getcorrection',
    artist,
    track: title,
    api_key: apiKey,
    format: 'json',
  });

  try {
    const res = await fetch(`${LASTFM_BASE}?${params.toString()}`, { signal: AbortSignal.timeout(LASTFM_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const correction = data?.corrections?.correction;
    const track = Array.isArray(correction) ? correction[0]?.track : correction?.track;
    const correctedArtist = track?.artist?.name;
    const correctedTitle = track?.name;
    if (typeof correctedArtist !== 'string' || typeof correctedTitle !== 'string' || !correctedArtist || !correctedTitle) {
      return null;
    }
    return { artist: correctedArtist, title: correctedTitle };
  } catch {
    return null;
  }
}

function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return createHash('md5').update(base + secret, 'utf8').digest('hex');
}

export function getAuthUrl(callbackUrl: string): string | null {
  const { apiKey } = getLastfmSettings();
  if (!apiKey) return null;
  const params = new URLSearchParams({ api_key: apiKey, cb: callbackUrl });
  return `https://www.last.fm/api/auth/?${params.toString()}`;
}

export async function getSession(token: string): Promise<{ sessionKey: string; username: string } | null> {
  const { apiKey, apiSecret } = getLastfmSettings();
  if (!apiKey || !apiSecret || !isOnline()) return null;

  const params: Record<string, string> = { method: 'auth.getSession', api_key: apiKey, token };
  const qs = new URLSearchParams({ ...params, api_sig: sign(params, apiSecret), format: 'json' });

  try {
    const res = await fetch(`${LASTFM_BASE}?${qs.toString()}`, { signal: AbortSignal.timeout(LASTFM_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const sessionKey = data?.session?.key;
    const username = data?.session?.name;
    if (typeof sessionKey !== 'string' || typeof username !== 'string') return null;
    return { sessionKey, username };
  } catch {
    return null;
  }
}

export async function scrobble(params: {
  sessionKey: string;
  artist: string;
  track: string;
  timestamp: number;
}): Promise<boolean> {
  const { apiKey, apiSecret } = getLastfmSettings();
  if (!apiKey || !apiSecret || !isOnline()) return false;

  const signedParams: Record<string, string> = {
    method: 'track.scrobble',
    api_key: apiKey,
    sk: params.sessionKey,
    artist: params.artist,
    track: params.track,
    timestamp: String(params.timestamp),
  };
  const body = new URLSearchParams({ ...signedParams, api_sig: sign(signedParams, apiSecret), format: 'json' });

  try {
    const res = await fetch(LASTFM_BASE, { method: 'POST', body, signal: AbortSignal.timeout(LASTFM_FETCH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}
