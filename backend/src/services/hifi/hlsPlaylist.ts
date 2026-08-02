/** HLS media/master playlist parsing. */

const HLS_MAP_TAG_RE = /#EXT-X-MAP:.*URI="([^"]+)"/;

export interface ParsedHlsPlaylist {
  /** URI of the init (fMP4 moov) segment, if the playlist uses one. */
  initUri: string | null;
  /** Ordered segment URIs. When the playlist was a master playlist, this is a
   * single-element array holding the chosen variant playlist's URL — the caller
   * must fetch and re-parse it. */
  segmentUris: string[];
}

/** Resolve a possibly-relative URI against the playlist's own URL (urljoin equivalent). */
function resolve(uri: string, base: string): string {
  return new URL(uri, base).toString();
}

export function parseHlsPlaylist(text: string, playlistUrl: string): ParsedHlsPlaylist {
  let initUri: string | null = null;
  const segmentUris: string[] = [];
  let variantUri: string | null = null;

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    if (line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXT-X-STREAM-INF')) {
      for (const nextLine of lines.slice(index + 1)) {
        if (!nextLine.startsWith('#')) {
          variantUri = resolve(nextLine, playlistUrl);
          break;
        }
      }
      break;
    }

    if (line.startsWith('#EXT-X-MAP')) {
      const match = HLS_MAP_TAG_RE.exec(line);
      if (match?.[1]) initUri = match[1];
      continue;
    }

    if (line.startsWith('#')) continue;

    segmentUris.push(resolve(line, playlistUrl));
  }

  if (variantUri) {
    return { initUri: null, segmentUris: [variantUri] };
  }

  if (segmentUris.length === 0) {
    throw new Error('No segment URIs found in the HLS playlist');
  }

  return {
    initUri: initUri ? resolve(initUri, playlistUrl) : null,
    segmentUris,
  };
}
