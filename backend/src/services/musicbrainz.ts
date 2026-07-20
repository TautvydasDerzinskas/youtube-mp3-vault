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
  releaseYear: number | null;
  mbRecordingId: string | null;
}

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

const CHANNEL_NOISE_SUFFIXES = ['vevo', 'official', 'music', 'records', 'channel'];

function cleanChannelName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const topicMatch = raw.match(/^(.+?)\s*-\s*Topic$/i);
  if (topicMatch) return topicMatch[1].trim() || null;

  let cleaned = raw.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const word of CHANNEL_NOISE_SUFFIXES) {
      const re = new RegExp(`[\\s\\-_]*${word}$`, 'i');
      if (re.test(cleaned)) {
        cleaned = cleaned.replace(re, '').trim();
        changed = true;
      }
    }
  }
  return cleaned || null;
}

export function parseArtistAndTitle(rawTitle: string, channelName: string | null): { artist: string | null; title: string } {
  const cleaned = rawTitle
    .replace(/[([][^)\]]*(official|video|audio|lyrics?|hd|4k|visualizer|remaster\w*)[^)\]]*[)\]]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let match = cleaned.match(/^(.{1,60}?)\s*[-–—|~]\s*(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };

  match = cleaned.match(/^(.{1,80}?):\s*(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };

  match = cleaned.match(/^(.+?)\s+by\s+(.{1,60})$/i);
  if (match) return { artist: match[2].trim(), title: match[1].trim() };

  return { artist: cleanChannelName(channelName), title: cleaned };
}

// Escapes Lucene special characters for MusicBrainz's search query syntax.
function escapeLucene(value: string): string {
  return value.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
}

export async function lookupTrackMetadata(rawTitle: string, channelName: string | null = null): Promise<TrackMetadata | null> {
  if (!isOnline()) return null;

  const { artist, title } = parseArtistAndTitle(rawTitle, channelName);
  if (!title) return null;

  const queryParts = [`recording:"${escapeLucene(title)}"`];
  if (artist) queryParts.push(`AND artist:"${escapeLucene(artist)}"`);

  const searchResult = await mbFetch(`/recording/?query=${encodeURIComponent(queryParts.join(' '))}&fmt=json&limit=10`);
  const candidates: any[] = Array.isArray(searchResult?.recordings) ? searchResult.recordings : [];
  if (candidates.length === 0) return null;

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

  const detail = await mbFetch(`/recording/${best.id}?inc=releases+media&fmt=json`);
  if (!detail) {
    return { artist: fallbackArtist, album: null, trackNumber: null, releaseYear: null, mbRecordingId: best.id };
  }

  const release = detail.releases?.[0];
  const track = release?.media?.[0]?.track?.[0] ?? release?.media?.[0]?.tracks?.[0];
  const trackNumber = track?.number ? parseInt(track.number, 10) : null;

  const releaseDate: string | undefined = detail['first-release-date'] || release?.date;
  const releaseYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;

  return {
    artist: detail['artist-credit']?.[0]?.name ?? fallbackArtist,
    album: release?.title ?? null,
    trackNumber: Number.isFinite(trackNumber) ? trackNumber : null,
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
    mbRecordingId: best.id,
  };
}
