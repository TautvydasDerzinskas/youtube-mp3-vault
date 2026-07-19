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
