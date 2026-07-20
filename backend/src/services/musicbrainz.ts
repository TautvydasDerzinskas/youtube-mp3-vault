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

// Phrases that only ever describe the *video upload* (official/lyrics/HD tag,
// "clip"/"premiere" in Russian and Lithuanian, etc.) rather than the track
// itself — safe to strip. Deliberately excludes remix/mix/edit/version/feat
// wording, which is real track information we want to keep.
const JUNK_TAG_WORDS = [
  'official', 'video', 'audio', 'lyrics?', 'visualizer', 'remaster\\w*',
  'hd', 'hq', '4k', 'cover\\s*art', 'out\\s*now',
  'клип', 'официальн\\w*', 'премьера\\w*',
  'oficialus', 'klipas',
];
// Multi-word phrases only meaningful as a *trailing, unbracketed* suffix —
// kept separate from JUNK_TAG_WORDS above because a bare "music"/"mood"
// would be too aggressive inside JUNK_BRACKET_RE (e.g. it'd gut a
// legitimate descriptive bracket like "(Deep House Music Mix)").
const JUNK_TRAILING_PHRASES = ['music\\s*video', 'lyric\\s*video', 'video\\s*clip', 'mood\\s*video', 'video\\s*visual'];

const JUNK_BRACKET_RE = new RegExp(`[([][^)\\]]*\\b(${JUNK_TAG_WORDS.join('|')})\\b[^)\\]]*[)\\]]`, 'gi');
const JUNK_TRAILING_RE = new RegExp(`[\\s\\-|/,]+\\b(${[...JUNK_TRAILING_PHRASES, ...JUNK_TAG_WORDS].join('|')})\\b\\s*$`, 'i');

function stripJunkTags(rawTitle: string): string {
  let cleaned = rawTitle.replace(JUNK_BRACKET_RE, ' ').replace(/\s+/g, ' ').trim();

  // Bare (non-bracketed) junk suffixes, e.g. `Song Title - Official Video`
  // with no brackets at all. Strip iteratively for chains like `Lyrics / Lyric Video`.
  for (let i = 0; i < 10; i++) {
    const next = cleaned.replace(JUNK_TRAILING_RE, '').trim();
    if (next === cleaned) break;
    cleaned = next;
  }

  cleaned = cleaned.replace(/^[\s\-|,:]+|[\s\-|,:]+$/g, '').trim();

  // If every word turned out to be junk (e.g. the whole title was
  // "[Official Video]"), fall back to the untouched original rather than
  // persisting an empty string.
  return cleaned || rawTitle.trim();
}

export function parseArtistAndTitle(rawTitle: string, channelName: string | null): { artist: string | null; title: string } {
  const cleaned = stripJunkTags(rawTitle);

  // Requires whitespace on at least one side of the dash-like separator, so
  // a bare mid-word hyphen in an artist name (T-Pain, Hi-Rez, j-LO, Ta-ku,
  // Б-2…) isn't mistaken for the "Artist - Title" split.
  let match = cleaned.match(/^(.{1,70}?)(?:\s+[-–—|~•]\s*|\s*[-–—|~•]\s+)(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };

  match = cleaned.match(/^(.{1,70}?)\s*(?:::|\/\/)\s*(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };

  match = cleaned.match(/^(.{1,80}?):\s*(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };

  match = cleaned.match(/^(.+?)\s+by\s+(.{1,60})$/i);
  if (match) return { artist: match[2].trim(), title: match[1].trim() };

  return { artist: cleanChannelName(channelName), title: cleaned };
}

// Common short connector words that stay lowercase in title case, unless
// they open or close the string (matches the convention most music/media
// apps — Spotify, Apple Music, MusicBrainz editors — use for display names).
const TITLE_CASE_MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if', 'in', 'nor',
  'of', 'on', 'or', 'per', 'so', 'the', 'to', 'up', 'via', 'vs', 'vs.', 'x',
  'ft', 'ft.', 'feat', 'feat.', 'with', 'from',
]);

// Capitalizes the first letter of each contiguous letter-run within a word,
// so slash/hyphen-separated segments (e.g. "Melodic/Uplifting/Liquid",
// "T-Pain") each get capitalized — except a run right after an apostrophe
// that looks like a contraction suffix ('s, 't, 're, 've, 'll, 'd, 'm),
// which stays lowercase so "Carla's"/"Won't" don't become "Carla'S"/"Won'T".
const APOSTROPHE_CONTRACTION_SUFFIXES = new Set(['s', 't', 're', 've', 'll', 'd', 'm']);

function capitalizeWord(word: string): string {
  return word.replace(/(^|[^\p{L}])(\p{L}+)/gu, (_whole, boundary: string, run: string) => {
    if (/['’‘]/.test(boundary) && APOSTROPHE_CONTRACTION_SUFFIXES.has(run.toLocaleLowerCase())) {
      return boundary + run.toLocaleLowerCase();
    }
    return boundary + run[0].toLocaleUpperCase() + run.slice(1).toLocaleLowerCase();
  });
}

export function toTitleCase(input: string): string {
  const tokens = input.split(/(\s+)/);
  const wordTokenIndices = tokens.map((t, i) => (t.trim() ? i : -1)).filter(i => i >= 0);
  const lastWordIndex = wordTokenIndices[wordTokenIndices.length - 1];

  return tokens
    .map((token, i) => {
      if (!token.trim()) return token;
      const bareWord = token.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const isEdge = i === wordTokenIndices[0] || i === lastWordIndex;
      if (!isEdge && TITLE_CASE_MINOR_WORDS.has(bareWord)) return token.toLocaleLowerCase();
      return capitalizeWord(token);
    })
    .join('');
}

// Used when MusicBrainz has no match for a track — a purely local, offline
// best-effort guess so the library isn't left with a blank artist.
export function deriveFallbackMetadata(rawTitle: string, channelName: string | null): { artist: string | null; title: string } {
  const { artist, title } = parseArtistAndTitle(rawTitle, channelName);
  return {
    artist: artist ? toTitleCase(artist) : null,
    title: toTitleCase(title),
  };
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
