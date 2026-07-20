import { isOnline } from './connectivity';
import { config } from '../config';

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
  if (!config.lastfmApiKey || !isOnline()) return [];
  if (!artist.trim() || !title.trim()) return [];

  const params = new URLSearchParams({
    method: 'track.getsimilar',
    artist,
    track: title,
    api_key: config.lastfmApiKey,
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
