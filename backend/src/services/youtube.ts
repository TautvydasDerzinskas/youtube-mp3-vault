import { spawn } from 'child_process';

export interface VideoEntry {
  id: string;
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  position: number;
  isAvailable: boolean;
  channelName: string | null;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  videos: VideoEntry[];
}

/** Strip everything from a YouTube URL except the list= param. */
export function normalizePlaylistUrl(raw: string): { url: string; playlistId: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    const err = new Error('Invalid URL');
    (err as any).code = 'INVALID_URL';
    throw err;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') {
    const err = new Error('Not a YouTube URL');
    (err as any).code = 'INVALID_URL';
    throw err;
  }

  const listId = parsed.searchParams.get('list');
  if (!listId) {
    const err = new Error('URL does not contain a playlist ID (missing ?list=…)');
    (err as any).code = 'NO_PLAYLIST_ID';
    throw err;
  }

  return {
    url: `https://www.youtube.com/playlist?list=${listId}`,
    playlistId: listId,
  };
}

// yt-dlp passes these through as the literal title for playlist entries that
// point at private/deleted/geo-locked videos — YouTube itself renders these
// placeholders in the playlist UI, they're not something we're inferring.
const PLACEHOLDER_TITLE_RE = /^\[(private video|deleted video|video unavailable|unavailable)\]$/i;

function isPlaceholderTitle(title: string | undefined): boolean {
  return !title || PLACEHOLDER_TITLE_RE.test(title.trim());
}

function pickThumbnail(thumbnails: unknown): string | null {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return null;
  const sorted = [...thumbnails].sort((a, b) => {
    return ((b.width ?? 0) * (b.height ?? 0)) - ((a.width ?? 0) * (a.height ?? 0));
  });
  return (sorted[0]?.url as string) ?? null;
}

/**
 * Runs yt-dlp --flat-playlist against a normalised playlist URL and returns
 * structured playlist + video metadata.
 */
export async function fetchPlaylist(playlistUrl: string): Promise<PlaylistInfo> {
  return new Promise((resolve, reject) => {
    const args = [
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      '--ignore-errors',
      playlistUrl,
    ];

    const proc = spawn('yt-dlp', args);
    let raw = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        const e = new Error('yt-dlp is not installed or not in PATH');
        (e as any).code = 'YTDLP_NOT_FOUND';
        return reject(e);
      }
      reject(err);
    });

    proc.on('close', () => {
      const entries = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean);

      if (entries.length === 0) {
        const e = new Error(
          stderr.includes('does not exist') || stderr.includes('unavailable')
            ? 'Playlist is unavailable or does not exist'
            : 'Playlist appears to be empty or private'
        );
        (e as any).code = 'FETCH_FAILED';
        return reject(e);
      }

      const first = entries[0] as Record<string, unknown>;
      const playlistTitle = (first.playlist_title ?? first.playlist ?? 'Unknown Playlist') as string;
      const playlistId = (first.playlist_id ?? '') as string;

      // Private/deleted/region-locked entries always fail to download and never
      // will — drop them here so they're never inserted, never attempted, and
      // never counted, instead of showing up as permanent "failed" rows.
      const videos: VideoEntry[] = entries
        .map((e: Record<string, unknown>, idx: number) => ({
          id: e.id as string,
          title: (e.title as string | undefined) ?? '[Unavailable]',
          duration: typeof e.duration === 'number' ? e.duration : null,
          thumbnailUrl: pickThumbnail(e.thumbnails) ?? (e.thumbnail as string | null) ?? null,
          position: typeof e.playlist_index === 'number' ? (e.playlist_index as number) : idx + 1,
          isAvailable: typeof e.id === 'string' && e.id.length > 0 && !isPlaceholderTitle(e.title as string | undefined),
          channelName: (e.channel as string | undefined) || (e.uploader as string | undefined) || null,
        }))
        .filter((v) => v.isAvailable);

      resolve({
        id: playlistId,
        title: playlistTitle,
        thumbnailUrl: videos[0]?.thumbnailUrl ?? null,
        videos,
      });
    });
  });
}

export interface RemixResult {
  id: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

/**
 * Runs a yt-dlp search and returns whatever JSON entries it prints — best
 * effort throughout (unlike fetchPlaylist, nothing here is critical-path):
 * yt-dlp missing, a search returning nothing, or malformed output all just
 * resolve to an empty list rather than rejecting.
 */
function runYtDlpSearch(searchQuery: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--flat-playlist', '--dump-json', '--no-warnings', '--ignore-errors', searchQuery]);
    let raw = '';

    proc.stdout.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
    proc.stderr.on('data', () => {});
    proc.on('error', () => resolve([]));

    proc.on('close', () => {
      const entries = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((e): e is Record<string, unknown> => e !== null);
      resolve(entries);
    });
  });
}

// Tried in order against a candidate remix title to pull out *who* remixed
// it — "(David Guetta Remix)", "[David Guetta Remix]", "Title - David Guetta
// Remix", "Remix by David Guetta", and a bare "Title David Guetta Remix"
// with no separator at all. The point isn't perfect attribution, just a
// stable-enough key that the same remix retitled slightly differently
// collapses to one dedup bucket instead of five near-identical rows.
const REMIX_KEY_PATTERNS: RegExp[] = [
  /\(([^)]+?)\s*remix\)/i,
  /\[([^\]]+?)\s*remix\]/i,
  /[-–—]\s*([^-–—()[\]]+?)\s*remix\b/i,
  /remix\s+by\s+([^([\n,]+)/i,
  /\b([a-z0-9&.' ]{2,40}?)\s+remix\b/i,
];

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractRemixKey(rawTitle: string): string {
  for (const re of REMIX_KEY_PATTERNS) {
    const captured = rawTitle.match(re)?.[1]?.trim();
    if (captured) {
      const normalized = normalizeKey(captured);
      if (normalized) return normalized;
    }
  }
  // No remixer name extractable (bare "(Remix)", "VIP Mix", …) — fall back to
  // the whole normalized title, so at least an exact reupload still dedups.
  return normalizeKey(rawTitle);
}

/**
 * Searches YouTube (via yt-dlp's ytsearch, no API key) for remixes of a
 * track and de-dupes results that are the same remix reuploaded or retitled
 * slightly differently — see REMIX_KEY_PATTERNS. `query` should already be a
 * clean "artist title" string (see parseArtistAndTitle in musicbrainz.ts) —
 * this function only appends "remix" and doesn't otherwise clean it up.
 */
export async function searchRemixes(query: string, excludeYoutubeId: string, limit = 5): Promise<RemixResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  // Search wider than `limit` — most of the raw hits will collapse into a
  // handful of dedup buckets (or aren't remixes at all), so 5 raw results
  // would rarely survive down to 5 *distinct* ones.
  const entries = await runYtDlpSearch(`ytsearch25:${trimmedQuery} remix`);

  const seenKeys = new Set<string>();
  const results: RemixResult[] = [];
  for (const e of entries) {
    if (results.length >= limit) break;

    const id = e.id as string | undefined;
    const title = (e.title as string | undefined) ?? '';
    if (!id || id === excludeYoutubeId || !title) continue;
    if (!/remix/i.test(title)) continue;

    const key = extractRemixKey(title);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    results.push({
      id,
      title,
      channelName: (e.channel as string | undefined) || (e.uploader as string | undefined) || null,
      thumbnailUrl: pickThumbnail(e.thumbnails) ?? (e.thumbnail as string | null) ?? null,
      duration: typeof e.duration === 'number' ? e.duration : null,
    });
  }
  return results;
}

export interface YoutubeMatch {
  id: string;
  thumbnailUrl: string | null;
  duration: number | null;
}

/**
 * Resolves a plain "artist title" query (e.g. from an external recommendation
 * source that has no YouTube ID of its own — see lastfm.ts) to a single best-
 * guess playable YouTube video, the same yt-dlp-search-no-API-key mechanism
 * searchRemixes uses. Best-effort: null on no match, yt-dlp down, or the only
 * hit being the track we're already looking at recommendations for.
 */
export async function resolveTopMatch(query: string, excludeYoutubeId?: string): Promise<YoutubeMatch | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  const [entry] = await runYtDlpSearch(`ytsearch1:${trimmedQuery}`);
  const id = entry?.id as string | undefined;
  if (!id || id === excludeYoutubeId) return null;

  return {
    id,
    thumbnailUrl: pickThumbnail(entry.thumbnails) ?? (entry.thumbnail as string | null) ?? null,
    duration: typeof entry.duration === 'number' ? entry.duration : null,
  };
}
