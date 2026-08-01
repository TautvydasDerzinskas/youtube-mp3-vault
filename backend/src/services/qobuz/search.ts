// Ported from the standalone qobuz_module prototype (not part of this repo) — its src/server/qobuzSearch.ts (itself ported from the
// search + scoring logic in SpotiFLAC's qobuz.go). Text-query only (no ISRC
// available here — just an artist + title from our own PlaylistVideo rows).
import { doQobuzSignedJSONRequest } from './credentials';

export interface QobuzTrack {
  id: number;
  title: string;
  version?: string;
  duration: number;
  track_number: number;
  media_number: number;
  isrc: string;
  copyright?: string;
  maximum_bit_depth: number;
  maximum_sampling_rate: number;
  hires: boolean;
  hires_streamable: boolean;
  release_date_original?: string;
  performer?: { name: string; id: number };
  album: {
    title: string;
    id: string;
    image?: { small?: string; thumbnail?: string; large?: string };
    artist?: { name: string; id: number };
    label?: { name: string };
  };
}

interface QobuzSearchResponse {
  tracks: {
    total: number;
    items: QobuzTrack[];
  };
}

export interface ScoredQobuzTrack {
  track: QobuzTrack;
  score: number;
  displayArtist: string;
  displayTitle: string;
  isHiRes: boolean;
}

function normalizeSearchValue(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replaceAll('&', ' and ')
    .replaceAll('feat.', ' ')
    .replaceAll('ft.', ' ')
    .replaceAll('/', ' ')
    .replaceAll('-', ' ')
    .replaceAll('_', ' ');
  return normalized.split(/\s+/).filter(Boolean).join(' ');
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function qobuzTrackDisplayArtist(track: QobuzTrack): string {
  return firstNonEmpty(track.performer?.name, track.album.artist?.name);
}

export function qobuzTrackDisplayTitle(track: QobuzTrack): string {
  const title = track.title?.trim() ?? '';
  const version = track.version?.trim();
  return version ? `${title} (${version})` : title;
}

export function qobuzTrackSupportsHiRes(track: QobuzTrack): boolean {
  if (track.hires || track.hires_streamable) return true;
  return track.maximum_bit_depth >= 24 || track.maximum_sampling_rate > 48;
}

const BAD_KEYWORDS = [
  'karaoke',
  'instrumental',
  'cover',
  'tribute',
  'as made famous by',
  'in the style of',
  'lullaby',
  '8 bit',
  '8-bit',
  '16 bit',
  '16-bit',
  'chill',
];

export function scoreQobuzSearchCandidate(track: QobuzTrack, queryTitle: string, queryArtist: string, queryAlbum: string): number {
  let score = 0;

  const titleNeedle = normalizeSearchValue(queryTitle);
  const titleHaystack = normalizeSearchValue(track.title ?? '');
  if (titleNeedle && titleHaystack === titleNeedle) {
    score += 1000;
  } else if (titleNeedle && (titleHaystack.includes(titleNeedle) || titleNeedle.includes(titleHaystack))) {
    score += 500;
  }

  const artistNeedle = normalizeSearchValue(queryArtist);
  const artistHaystack = normalizeSearchValue(qobuzTrackDisplayArtist(track));
  let artistMatched = false;
  if (artistNeedle && artistHaystack === artistNeedle) {
    score += 300;
    artistMatched = true;
  } else if (artistNeedle && artistHaystack && (artistHaystack.includes(artistNeedle) || artistNeedle.includes(artistHaystack))) {
    score += 180;
    artistMatched = true;
  }

  if (artistNeedle && !artistMatched) {
    const needleTokens = artistNeedle.split(' ');
    const haystackTokens = artistHaystack.split(' ');
    const matchCount = needleTokens.filter((nt) => haystackTokens.includes(nt)).length;
    if (matchCount > 0) {
      score += 50;
      artistMatched = true;
    } else {
      score -= 2000;
    }
  }

  const albumNeedle = normalizeSearchValue(queryAlbum);
  const albumHaystack = normalizeSearchValue(track.album?.title ?? '');
  if (albumNeedle && albumHaystack === albumNeedle) {
    score += 150;
  } else if (albumNeedle && albumHaystack && (albumHaystack.includes(albumNeedle) || albumNeedle.includes(albumHaystack))) {
    score += 90;
  }

  if (qobuzTrackSupportsHiRes(track)) {
    score += 40;
  } else if (track.maximum_bit_depth >= 16) {
    score += 20;
  }

  for (const kw of BAD_KEYWORDS) {
    if (titleHaystack.includes(kw) && !titleNeedle.includes(kw)) score -= 2000;
    if (artistHaystack.includes(kw) && !artistNeedle.includes(kw)) score -= 2000;
  }

  return score;
}

/**
 * Minimum score for a top candidate to be trusted for *unattended* selection
 * (no human looking at the result first — this is the only mode the backend
 * ever uses Qobuz in). For reference: an exact title match alone scores
 * 1000; a partial title match with no artist corroboration scores 500; any
 * artist mismatch when an artist was supplied tanks the score by -2000. 400
 * comfortably clears "partial title + some artist signal" while rejecting
 * title-only weak partial matches and any case where the supplied artist
 * doesn't match at all.
 */
export const MIN_CONFIDENT_SCORE = 400;

/**
 * Searches Qobuz's public track/search API by free text (artist + title) and
 * returns candidates ranked best-first, exactly like qobuz.go's fallback path.
 */
export async function searchQobuzByText(title: string, artist: string, album = '', limit = 10): Promise<ScoredQobuzTrack[]> {
  const query = [title, artist].map((s) => s.trim()).filter(Boolean).join(' ');
  if (!query) throw new Error('title and/or artist is required');

  const resp = await doQobuzSignedJSONRequest<QobuzSearchResponse>('track/search', {
    query,
    limit: String(limit),
  });

  if (!resp.tracks || resp.tracks.total === 0 || resp.tracks.items.length === 0) {
    return [];
  }

  return resp.tracks.items
    .map((track) => ({
      track,
      score: scoreQobuzSearchCandidate(track, title, artist, album),
      displayArtist: qobuzTrackDisplayArtist(track),
      displayTitle: qobuzTrackDisplayTitle(track),
      isHiRes: qobuzTrackSupportsHiRes(track),
    }))
    .sort((a, b) => b.score - a.score);
}
