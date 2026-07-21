import { runYtDlp } from './ytdlpProcess';

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

// 5 minutes — just a metadata listing (not a file download), but a very
// large playlist can paginate through YouTube's internal API for a while.
const PLAYLIST_FETCH_TIMEOUT_MS = 5 * 60 * 1000;

export async function fetchPlaylist(playlistUrl: string): Promise<PlaylistInfo> {
  const args = [
    '--flat-playlist',
    '--dump-json',
    '--no-warnings',
    '--ignore-errors',
    // Large playlists paginate through YouTube's internal API as they're
    // enumerated, and the default "web" client can get 403'd by PO-token
    // checks partway through (see downloader.ts's downloadVideo, which
    // hit the same thing) — the android client avoids that requirement.
    '--extractor-args', 'youtube:player_client=default,android,-tv',
    playlistUrl,
  ];

  const { code, stdout: raw, stderr } = await runYtDlp(args, PLAYLIST_FETCH_TIMEOUT_MS);

  // A non-zero exit means yt-dlp didn't finish listing the playlist — e.g. a
  // dropped connection partway through a large playlist. Without this check,
  // whatever partial output it managed to write before dying would be
  // trusted as "the complete current playlist," and refreshPlaylistFromYoutube
  // would treat every video that didn't make it into that partial list as
  // removed from the playlist — deleting their downloaded files.
  // --ignore-errors already lets individual unavailable videos through with
  // a 0 exit code, so a non-zero code here specifically means the whole
  // fetch was interrupted.
  if (code !== 0) {
    const e = new Error(`yt-dlp exited with code ${code} while listing the playlist: ${stderr.slice(0, 300) || '(no stderr output)'}`);
    (e as any).code = 'FETCH_FAILED';
    throw e;
  }

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
    throw e;
  }

  // Independent cross-check: each entry also carries playlist_count, taken
  // from YouTube's own page metadata (available up front, not derived from
  // how many entries yt-dlp itself managed to enumerate). If it disagrees
  // sharply with what we actually got, the enumeration was cut short even
  // though the process still exited 0 — e.g. yt-dlp gave up partway through
  // pagination without treating it as a hard error. A small gap is normal (a
  // few genuinely unavailable videos filtered by --ignore-errors), so only
  // reject on a substantial one.
  const declaredCount = entries
    .map((e) => (e as Record<string, unknown>).playlist_count)
    .find((n): n is number => typeof n === 'number');
  if (declaredCount != null) {
    const missing = declaredCount - entries.length;
    if (missing > Math.max(5, declaredCount * 0.1)) {
      const e = new Error(
        `yt-dlp only listed ${entries.length} of the ${declaredCount} videos the playlist reports having — treating as an incomplete fetch.`
      );
      (e as any).code = 'FETCH_FAILED';
      throw e;
    }
  }

  const first = entries[0] as Record<string, unknown>;
  const playlistTitle = (first.playlist_title ?? first.playlist ?? 'Unknown Playlist') as string;
  const playlistId = (first.playlist_id ?? '') as string;

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

  return {
    id: playlistId,
    title: playlistTitle,
    thumbnailUrl: videos[0]?.thumbnailUrl ?? null,
    videos,
  };
}

export interface RemixResult {
  id: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

// 2 minutes — a search should be fast; generous ceiling for a slow connection.
const SEARCH_TIMEOUT_MS = 2 * 60 * 1000;

async function runYtDlpSearch(searchQuery: string): Promise<Record<string, unknown>[]> {
  try {
    // Exit code is deliberately ignored here (unlike fetchPlaylist) — this is
    // a best-effort discovery search (remixes/alternates), not the
    // authoritative playlist contents, so partial/incomplete output is still
    // useful rather than something to reject.
    const { stdout: raw } = await runYtDlp(
      ['--flat-playlist', '--dump-json', '--no-warnings', '--ignore-errors', searchQuery],
      SEARCH_TIMEOUT_MS,
    );
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e): e is Record<string, unknown> => e !== null);
  } catch {
    return [];
  }
}

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

export async function searchRemixes(query: string, excludeYoutubeIds: Set<string>, limit = 5): Promise<RemixResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const entries = await runYtDlpSearch(`ytsearch25:${trimmedQuery} remix`);

  const seenKeys = new Set<string>();
  const results: RemixResult[] = [];
  for (const e of entries) {
    if (results.length >= limit) break;

    const id = e.id as string | undefined;
    const title = (e.title as string | undefined) ?? '';
    if (!id || excludeYoutubeIds.has(id) || !title) continue;
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

// General-purpose multi-result search — unlike resolveTopMatch (which only
// ever looks at YouTube's #1 hit), this returns up to `limit` candidates so a
// caller can walk past ones that turn out to be duplicates/unusable. Used by
// playlistGenerator.ts for both similar-track resolution and "search for the
// original version" lookups.
export async function searchTopMatches(query: string, limit = 10): Promise<RemixResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const entries = await runYtDlpSearch(`ytsearch${limit}:${trimmedQuery}`);
  const results: RemixResult[] = [];
  for (const e of entries) {
    const id = e.id as string | undefined;
    if (!id) continue;
    results.push({
      id,
      title: (e.title as string | undefined) ?? '',
      channelName: (e.channel as string | undefined) || (e.uploader as string | undefined) || null,
      thumbnailUrl: pickThumbnail(e.thumbnails) ?? (e.thumbnail as string | null) ?? null,
      duration: typeof e.duration === 'number' ? e.duration : null,
    });
  }
  return results;
}

// Whether a title reads as a remix — same signal searchRemixes already uses
// to gate its own results, exposed here so playlistGenerator.ts can decide
// which fallback sub-tier applies (search for remixes vs. search for the
// original).
export function isRemixTitle(title: string): boolean {
  return /remix/i.test(title);
}

// Strips a "(X Remix)"/"[X Remix]"/"- X Remix"-style qualifier off a title,
// recovering a searchable query for the original version. Deliberately only
// targets "remix" (matching isRemixTitle above), not the broader family of
// mix/edit/bootleg wording — those are treated as legitimate track
// information elsewhere in the app (see musicbrainz.ts), not something to
// strip.
export function stripRemixQualifier(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*remix[^)\]]*[)\]]/gi, '')
    .replace(/\s*[-–—]\s*[^-–—()[\]]*\bremix\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface YoutubeMatch {
  id: string;
  thumbnailUrl: string | null;
  duration: number | null;
}

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
