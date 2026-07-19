import { isOnline } from './connectivity';
import { config } from '../config';

const MB_BASE = 'https://musicbrainz.org/ws/2';

// MusicBrainz asks unauthenticated clients to stay at/under 1 req/sec and to
// send an identifying User-Agent — https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = `YoutubeVault/1.0 ( ${config.frontendUrl} )`;

export interface TrackMetadata {
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  genre: string | null;
  mbRecordingId: string | null;
}

// Module-level, not per-call — every lookup in the process shares one clock so
// concurrent playlists (each syncing on their own sequential loop) still can't
// collectively exceed the 1 req/sec ceiling.
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function mbFetch(path: string): Promise<any | null> {
  await throttle();
  try {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Strips common YouTube music-video decorations ("(Official Video)", "[HD]", …)
// and splits the extremely common "Artist - Title" upload convention. Falls
// back to treating the whole (cleaned) string as the title when there's no
// dash, which still gives MusicBrainz something reasonable to search on.
function splitArtistTitle(rawTitle: string): { artist: string | null; title: string } {
  const cleaned = rawTitle
    .replace(/[([][^)\]]*(official|video|audio|lyrics?|hd|4k|visualizer|remaster\w*)[^)\]]*[)\]]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = cleaned.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };
  return { artist: null, title: cleaned };
}

// Escapes Lucene special characters for MusicBrainz's search query syntax.
function escapeLucene(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
}

/**
 * Best-effort MusicBrainz lookup for a single track, keyed off the YouTube
 * video title. Two throttled requests when a match is found: a search to find
 * the closest recording, then a lookup-by-MBID (the only reliable way to get
 * genres + release/track info back from MusicBrainz) for the details.
 * Returns null on no match, no connectivity, or any request/parsing failure —
 * callers treat that as "couldn't enrich this one", never as a hard error.
 */
export async function lookupTrackMetadata(rawTitle: string): Promise<TrackMetadata | null> {
  if (!isOnline()) return null;

  const { artist, title } = splitArtistTitle(rawTitle);
  if (!title) return null;

  const queryParts = [`recording:"${escapeLucene(title)}"`];
  if (artist) queryParts.push(`AND artist:"${escapeLucene(artist)}"`);

  const searchResult = await mbFetch(`/recording/?query=${encodeURIComponent(queryParts.join(' '))}&fmt=json&limit=10`);
  const candidates: any[] = Array.isArray(searchResult?.recordings) ? searchResult.recordings : [];
  if (candidates.length === 0) return null;

  // Text-match score alone tends to favor whatever has the most alternate
  // recordings — heavily-bootlegged songs return pages of live/demo variants
  // that all score 100, crowding out the actual studio track a YouTube
  // upload is almost always ripped from. release-group's primary/secondary
  // type is the most reliable "is this a plain studio album" signal MB
  // exposes (a live album is still primary-type "Album", just with a "Live"
  // secondary type); disambiguation text catches a few things that slip
  // past it (rehearsal tapes, karaoke backing tracks, …).
  const rank = (r: any): number => {
    let score = r?.score ?? 0;
    const releaseGroup = r?.releases?.[0]?.['release-group'];
    const secondaryTypes: string[] = releaseGroup?.['secondary-types'] ?? [];
    if (secondaryTypes.length > 0) score -= 40;
    if (releaseGroup?.['primary-type'] === 'Album' && secondaryTypes.length === 0) score += 20;
    if (r?.releases?.[0]?.status === 'Official') score += 10;
    if (/\b(live|demo|rehearsal|remix|instrumental|karaoke)\b/i.test(r?.disambiguation ?? '')) score -= 50;
    return score;
  };
  const highConfidence = candidates.filter(r => (r?.score ?? 0) >= 80);
  const best = (highConfidence.length > 0 ? highConfidence : candidates)
    .sort((a, b) => rank(b) - rank(a))[0];
  if (!best?.id) return null;

  const fallbackArtist = best['artist-credit']?.[0]?.name ?? artist ?? null;

  const detail = await mbFetch(`/recording/${best.id}?inc=genres+releases+media&fmt=json`);
  if (!detail) {
    return { artist: fallbackArtist, album: null, trackNumber: null, genre: null, mbRecordingId: best.id };
  }

  const release = detail.releases?.[0];
  const track = release?.media?.[0]?.track?.[0] ?? release?.media?.[0]?.tracks?.[0];
  const trackNumber = track?.number ? parseInt(track.number, 10) : null;

  const genreList: Array<{ name?: string; count?: number }> = Array.isArray(detail.genres) ? detail.genres : [];
  const topGenre = [...genreList].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]?.name ?? null;

  return {
    artist: detail['artist-credit']?.[0]?.name ?? fallbackArtist,
    album: release?.title ?? null,
    trackNumber: Number.isFinite(trackNumber) ? trackNumber : null,
    genre: topGenre,
    mbRecordingId: best.id,
  };
}
