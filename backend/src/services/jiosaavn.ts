import forge from 'node-forge';
import { isOnline } from './connectivity';

// Ported from the unofficial JioSaavn API (jiosaavn-api). JioSaavn returns song media
// URLs DES-encrypted; Node's built-in crypto can't decrypt them because OpenSSL 3
// dropped single-DES from its default provider, so this relies on node-forge instead.
const JIOSAAVN_API_BASE = 'https://www.jiosaavn.com/api.php';
const JIOSAAVN_FETCH_TIMEOUT_MS = 15_000;
const JIOSAAVN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const DES_KEY = '38346591';
const DES_IV = '00000000';

const MEDIA_QUALITIES = [
  { id: '_12', quality: '12kbps' },
  { id: '_48', quality: '48kbps' },
  { id: '_96', quality: '96kbps' },
  { id: '_160', quality: '160kbps' },
  { id: '_320', quality: '320kbps' },
];

const IMAGE_QUALITIES = ['50x50', '150x150', '500x500'];

export interface JioSaavnLink {
  quality: string;
  url: string;
}

export interface JioSaavnTrackResult {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number | null;
  url: string;
  media: JioSaavnLink[];
  thumbnails: JioSaavnLink[];
}

function decryptMediaLinks(encryptedMediaUrl: string | undefined): JioSaavnLink[] {
  if (!encryptedMediaUrl) return [];

  try {
    const decipher = forge.cipher.createDecipher('DES-ECB', forge.util.createBuffer(DES_KEY));
    decipher.start({ iv: forge.util.createBuffer(DES_IV) });
    decipher.update(forge.util.createBuffer(forge.util.decode64(encryptedMediaUrl)));
    decipher.finish();
    const decryptedUrl = decipher.output.getBytes();

    return MEDIA_QUALITIES.map(({ id, quality }) => ({ quality, url: decryptedUrl.replace('_96', id) }));
  } catch {
    return [];
  }
}

function createThumbnailLinks(imageUrl: string | undefined): JioSaavnLink[] {
  if (!imageUrl) return [];

  return IMAGE_QUALITIES.map((quality) => ({
    quality,
    url: imageUrl.replace(/150x150|50x50/, quality).replace(/^http:\/\//, 'https://'),
  }));
}

/** Searches JioSaavn for a song matching the given artist and title, returning available media qualities and thumbnails. */
export async function searchJioSaavnTrack(artist: string, title: string, limit = 10): Promise<JioSaavnTrackResult[]> {
  if (!isOnline()) return [];
  if (!artist.trim() && !title.trim()) return [];

  const query = `${artist} ${title}`.trim();

  const url = new URL(JIOSAAVN_API_BASE);
  url.searchParams.set('__call', 'search.getResults');
  url.searchParams.set('_format', 'json');
  url.searchParams.set('_marker', '0');
  url.searchParams.set('api_version', '4');
  url.searchParams.set('ctx', 'web6dot0');
  url.searchParams.set('q', query);
  url.searchParams.set('p', '0');
  url.searchParams.set('n', String(limit));

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json', 'User-Agent': JIOSAAVN_USER_AGENT },
      signal: AbortSignal.timeout(JIOSAAVN_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data: any = await res.json();
    const results: any[] = data?.results ?? [];

    return results.map((song): JioSaavnTrackResult => ({
      id: song.id,
      title: song.title,
      artist:
        song.more_info?.artistMap?.primary_artists?.map((a: any) => a.name).join(', ') ||
        song.subtitle ||
        '',
      album: song.more_info?.album || null,
      duration: song.more_info?.duration ? Number(song.more_info.duration) : null,
      url: song.perma_url,
      media: decryptMediaLinks(song.more_info?.encrypted_media_url),
      thumbnails: createThumbnailLinks(song.image),
    }));
  } catch {
    return [];
  }
}
