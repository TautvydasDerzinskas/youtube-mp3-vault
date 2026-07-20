import { createHash } from 'crypto';
import { isOnline } from './connectivity';
import { getLastfmSettings } from './settings';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

export interface SimilarTrack {
  artist: string;
  title: string;
  matchScore: number;
}

/**
 * Best-effort Last.fm track.getsimilar lookup — powers the track page's
 * "Discover" section (external similar tracks, as opposed to /recommendations'
 * in-library ones). Mirrors musicbrainz.ts's contract: returns [] on no API
 * key, no connectivity, no match, or any request/parsing failure, never
 * throws — callers treat that as "nothing to show", not an error state.
 */
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
    const res = await fetch(`${LASTFM_BASE}?${params.toString()}`);
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

// Last.fm's signing scheme (distinct from OAuth — this is their older
// "desktop application" auth flow, still the only way to get a scrobbling
// session): sort params by key, concatenate key+value pairs with no
// delimiter, append the shared secret, MD5 the result. Required on every
// call below except track.getsimilar above (that one's read-only and only
// needs the plain api_key). See https://www.last.fm/api/authspec.
function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return createHash('md5').update(base + secret, 'utf8').digest('hex');
}

/**
 * The URL to send a user to in order to authorize this app — Last.fm shows
 * its own login/approve page, then redirects back to `callbackUrl` with a
 * `?token=`. Null if apiKey isn't configured (caller should 503 rather than
 * redirect into a broken flow).
 */
export function getAuthUrl(callbackUrl: string): string | null {
  const { apiKey } = getLastfmSettings();
  if (!apiKey) return null;
  const params = new URLSearchParams({ api_key: apiKey, cb: callbackUrl });
  return `https://www.last.fm/api/auth/?${params.toString()}`;
}

/**
 * Exchanges the token from getAuthUrl's callback for a permanent session
 * key (unlike OAuth, this never expires — only revocable from the user's own
 * Last.fm account settings, or by disconnecting in our Profile page). Null
 * on missing config, an invalid/expired token, or any request failure.
 */
export async function getSession(token: string): Promise<{ sessionKey: string; username: string } | null> {
  const { apiKey, apiSecret } = getLastfmSettings();
  if (!apiKey || !apiSecret) return null;

  const params: Record<string, string> = { method: 'auth.getSession', api_key: apiKey, token };
  const qs = new URLSearchParams({ ...params, api_sig: sign(params, apiSecret), format: 'json' });

  try {
    const res = await fetch(`${LASTFM_BASE}?${qs.toString()}`);
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

/**
 * Records a completed play against the user's Last.fm profile. Best-effort
 * like getSimilarTracks — returns false rather than throwing, since a
 * scrobble failure should never surface as an error for "the song finished
 * playing" (see the /played route in routes/youtube.ts, which always applies
 * the internal play-count bump regardless of this call's outcome).
 */
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
    const res = await fetch(LASTFM_BASE, { method: 'POST', body });
    return res.ok;
  } catch {
    return false;
  }
}
