import type { ParsedTrack } from './types';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** hifi-api responses are inconsistently wrapped in a `{ data: ... }` envelope
 * depending on instance/endpoint. Unwrap once if present, otherwise pass through. */
export function unwrapEnvelope(data: unknown): unknown {
  if (isRecord(data) && 'data' in data) {
    return data.data ?? data;
  }
  return data;
}

/** Normalize one search/info track item into a flat, well-typed shape. */
export function parseTrack(item: unknown): ParsedTrack {
  if (!isRecord(item)) {
    throw new Error('Cannot parse track: item is not an object');
  }

  let artistName = 'Unknown Artist';
  let artistId: number | null = null;
  const artistsRaw = item.artists ?? item.artist;

  if (Array.isArray(artistsRaw)) {
    const names: string[] = [];
    for (const entry of artistsRaw) {
      if (isRecord(entry)) {
        names.push(typeof entry.name === 'string' ? entry.name : '');
        if (artistId === null && typeof entry.id === 'number') artistId = entry.id;
      } else if (typeof entry === 'string') {
        names.push(entry);
      }
    }
    const joined = names.filter(Boolean).join(', ');
    artistName = joined || 'Unknown Artist';
  } else if (isRecord(artistsRaw)) {
    artistName = typeof artistsRaw.name === 'string' ? artistsRaw.name : 'Unknown Artist';
    artistId = typeof artistsRaw.id === 'number' ? artistsRaw.id : null;
  } else if (typeof artistsRaw === 'string') {
    artistName = artistsRaw;
  }

  const albumRaw = item.album;
  let albumName = '';
  let albumId: number | null = null;
  if (isRecord(albumRaw)) {
    albumName = typeof albumRaw.title === 'string' ? albumRaw.title : typeof albumRaw.name === 'string' ? albumRaw.name : '';
    albumId = typeof albumRaw.id === 'number' ? albumRaw.id : null;
  } else if (typeof albumRaw === 'string') {
    albumName = albumRaw;
  }

  const durationRaw = typeof item.duration === 'number' ? item.duration : 0;
  // Some instances return seconds, others milliseconds — a value under 100000 is seconds.
  const durationMs = durationRaw && durationRaw < 100_000 ? durationRaw * 1000 : durationRaw;

  const id = typeof item.id === 'number' ? item.id : null;
  const trackNumber =
    typeof item.trackNumber === 'number' ? item.trackNumber : typeof item.track_number === 'number' ? item.track_number : null;

  return {
    id,
    artistId,
    albumId,
    title: typeof item.title === 'string' ? item.title : typeof item.name === 'string' ? item.name : 'Unknown',
    artist: artistName,
    album: albumName,
    durationMs: Math.trunc(durationMs || 0),
    trackNumber,
    isrc: typeof item.isrc === 'string' ? item.isrc : null,
    bpm: typeof item.bpm === 'number' ? item.bpm : null,
    copyright: typeof item.copyright === 'string' ? item.copyright : null,
    explicit: Boolean(item.explicit ?? false),
    quality: typeof item.audioQuality === 'string' ? item.audioQuality : typeof item.quality === 'string' ? item.quality : '',
  };
}

/** Extract the HLS playlist URI from a /trackManifests/ response. Returns:
 *   - a non-empty string: the playlist URI
 *   - '': the response parsed fine but `uri` was explicitly empty (caller should stop, not fall back)
 *   - null: `uri` was absent or the response shape was unrecognized (caller should try the legacy endpoint) */
export function extractManifestUri(data: unknown): string | null {
  try {
    const inner = unwrapEnvelope(data);
    if (!isRecord(inner)) return null;
    const nested = isRecord(inner.data) ? inner.data : {};
    const attrs = isRecord(nested.attributes) ? nested.attributes : {};
    return typeof attrs.uri === 'string' ? attrs.uri : null;
  } catch {
    return null;
  }
}

/** Extract direct playable URLs from a legacy /track/ response's base64-encoded
 * manifest. Empty array if the manifest is encrypted or malformed. */
export function extractLegacyManifestUrls(data: unknown): string[] {
  try {
    const inner = unwrapEnvelope(data);
    if (!isRecord(inner) || typeof inner.manifest !== 'string' || !inner.manifest) return [];

    const manifest = JSON.parse(Buffer.from(inner.manifest, 'base64').toString('utf-8')) as JsonRecord;
    const encryptionType = manifest.encryptionType;
    if (encryptionType !== undefined && encryptionType !== null && encryptionType !== 'NONE') return [];

    const urls = manifest.urls;
    if (!Array.isArray(urls)) return [];
    return urls.filter((url): url is string => typeof url === 'string' && url.length > 0);
  } catch {
    return [];
  }
}

/** Infer the output extension from a legacy manifest's mimeType/codecs, falling back
 * to the quality tier's default extension when nothing conclusive is found. */
export function extensionFromLegacyManifest(data: unknown, fallback: 'flac' | 'm4a'): 'flac' | 'm4a' {
  try {
    const inner = unwrapEnvelope(data);
    if (!isRecord(inner) || typeof inner.manifest !== 'string') return fallback;

    const manifest = JSON.parse(Buffer.from(inner.manifest, 'base64').toString('utf-8')) as JsonRecord;
    const mime = typeof manifest.mimeType === 'string' ? manifest.mimeType.toLowerCase() : '';
    const codecs = typeof manifest.codecs === 'string' ? manifest.codecs.toLowerCase() : '';

    if (mime.includes('flac') || codecs.includes('flac')) return 'flac';
    if (mime.includes('mp4') || codecs.includes('aac')) return 'm4a';
  } catch {
    // fall through to fallback
  }
  return fallback;
}
