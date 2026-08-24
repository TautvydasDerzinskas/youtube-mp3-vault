import { isOnline } from './connectivity';

// Ported from bandcamp-dl (bandcamp_dl/bandcampDownloader.py), the reference
// implementation this provider is based on: that script scraped a `var
// TralbumData = ...` object off a bandcamp.com track page and read its
// "file"["mp3-128"] field — an ad-hoc, no-login-required 128kbps preview
// stream Bandcamp exposes for any track, purchased or not, independent of
// whatever paid formats (FLAC, ALAC, 320kbps mp3, etc.) that artist may also
// sell through a separate checkout flow this provider doesn't implement. That
// 128kbps stream is still the only thing available for most tracks handled
// here, but not all: a track the artist has separately opted into "Free
// Download" (see getBandcampFreeDownloadUrl below) exposes those same paid-
// tier formats with no checkout at all, and this provider now follows that
// path when it's there.
// Bandcamp has since dropped that inline `var TralbumData` script entirely —
// the same JSON now lives HTML-entity-encoded in a `data-tralbum="..."`
// attribute instead (confirmed against a live track page; the reference
// script's own scrape target no longer exists on the page at all) — so
// extraction below targets that attribute, but the actual data shape (and
// the mp3-128 field within it) is otherwise unchanged from what the
// reference script relied on. Unlike that script, which only ever worked
// given a direct track URL, search here is a new addition (bandcamp-dl had
// none of its own) built on Bandcamp's own search-bar autocomplete API, so
// this provider can be driven by artist/title like every other one in this
// app rather than needing a URL supplied up front.
const BANDCAMP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

// Generous but bounded — same rationale as every other per-request network
// timeout in this app (see jiosaavn.ts/deezer.ts): a stalled request
// shouldn't hang the calling sync pass forever.
const FETCH_TIMEOUT_MS = 15_000;

// Bandcamp always serves this fixed-bitrate stream for free, regardless of
// what higher-quality formats that track's artist may also offer through a
// paid/download flow this provider doesn't implement (see module comment
// above) — the floor this provider falls back to when a track has no Free
// Download page, and used to short-circuit a search when even that floor
// could never beat what's already on file.
export const BANDCAMP_STREAM_BITRATE_KBPS = 128;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

export interface BandcampSearchResult {
  title: string;
  artist: string;
  url: string;
}

// Bandcamp's own search-bar autocomplete endpoint — undocumented, but stable
// enough that other unofficial Bandcamp scraper/API projects already rely on
// it the same way, and the only Bandcamp-provided way to go from an
// artist/title query to a candidate track URL at all (the reference
// bandcamp-dl script had no search of its own, see module comment above).
// search_filter: 't' restricts results to individual tracks (as opposed to
// albums/artists/fan pages), the only result type this provider can resolve
// to a playable stream.
export async function searchBandcampTracks(query: string, limit = 10): Promise<BandcampSearchResult[]> {
  if (!isOnline()) return [];
  if (!query.trim()) return [];

  try {
    const res = await fetchWithTimeout('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': BANDCAMP_USER_AGENT },
      body: JSON.stringify({ fan_id: null, full_page: false, search_filter: 't', search_text: query }),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const results: any[] = data?.auto?.results ?? [];
    return results
      .filter((item) => item?.type === 't' && typeof item?.item_url_path === 'string')
      .slice(0, limit)
      .map((item): BandcampSearchResult => ({
        title: item.name ?? '',
        artist: item.band_name ?? '',
        url: item.item_url_path,
      }));
  } catch {
    return [];
  }
}

export interface BandcampTrackDetails {
  title: string;
  artist: string;
  durationSec: number | null;
  streamUrl: string;
  // Present only when the artist has explicitly marked this track "Free
  // Download" (a distinct, no-checkout-required opt-in from the merely-free
  // `mp3-128` preview stream every track exposes, and from a "name your
  // price" track, which requires an email-confirmed checkout even at $0 —
  // see getBandcampFreeDownloadUrl). Most tracks have neither and this stays
  // null; nothing here attempts to work around that.
  freeDownloadPage: string | null;
}

// HTML-decodes just the handful of entities Bandcamp's own encoder actually
// emits inside this attribute — the full general-purpose HTML5 entity table
// (thousands of named entities) is unneeded and would mean pulling in a
// dependency; this attribute is machine-generated JSON, not free-form
// authored HTML, so nothing outside this small, fixed set ever appears in it.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Fetches a bandcamp.com track page and extracts its embedded tralbum data —
// the modern equivalent of the reference script's `var TralbumData =` scrape
// (see module comment above). Returns null for a page that's gone, a
// non-track (album/artist) URL, or one Bandcamp has otherwise restructured
// away from the shape this expects.
export async function getBandcampTrackDetails(trackUrl: string): Promise<BandcampTrackDetails | null> {
  if (!isOnline()) return null;

  let html: string;
  try {
    const res = await fetchWithTimeout(trackUrl, { headers: { 'User-Agent': BANDCAMP_USER_AGENT } });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const match = html.match(/data-tralbum="([^"]*)"/);
  if (!match) return null;

  try {
    const tralbum = JSON.parse(decodeHtmlEntities(match[1]));
    const track = tralbum?.trackinfo?.[0];
    const streamUrl = track?.file?.['mp3-128'];
    if (typeof streamUrl !== 'string') return null;

    return {
      // `current.title` is the track's own clean title; `trackinfo[0].title`
      // is frequently the uploader's own "Artist - Title"-style string
      // instead (seen on reupload/fan-page tracks in practice), so it's only
      // a fallback for the rare page missing `current` entirely.
      title: tralbum?.current?.title ?? track?.title ?? '',
      artist: tralbum?.artist ?? '',
      durationSec: typeof track?.duration === 'number' ? track.duration : null,
      streamUrl,
      freeDownloadPage: typeof tralbum?.freeDownloadPage === 'string' ? tralbum.freeDownloadPage : null,
    };
  } catch {
    return null;
  }
}

interface BandcampFreeDownloadFormat {
  format: string;
  url: string;
}

// The free-download page (reached via BandcampTrackDetails.freeDownloadPage)
// embeds its own separate JSON blob — in a `data-blob` attribute again, but
// on a `<script id="pagedata">` element this time, not the track page's
// `data-tralbum` — listing every format the artist's upload actually offers
// (mp3-320, flac, wav, alac, ...) each as a not-yet-downloadable "ticket" URL
// that still has to be exchanged via resolveBandcampStatDownload below.
async function getBandcampFreeDownloadFormats(freeDownloadPageUrl: string): Promise<BandcampFreeDownloadFormat[]> {
  let html: string;
  try {
    const res = await fetchWithTimeout(freeDownloadPageUrl, { headers: { 'User-Agent': BANDCAMP_USER_AGENT } });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  // Attribute order on this element isn't guaranteed, unlike the single-
  // attribute data-tralbum match above, so both orderings are checked.
  const scriptMatch =
    html.match(/<script[^>]*id="pagedata"[^>]*data-blob="([^"]*)"/) ||
    html.match(/<script[^>]*data-blob="([^"]*)"[^>]*id="pagedata"/);
  if (!scriptMatch) return [];

  try {
    const blob = JSON.parse(decodeHtmlEntities(scriptMatch[1]));
    const downloads = blob?.digital_items?.[0]?.downloads;
    if (!downloads || typeof downloads !== 'object') return [];
    return Object.entries(downloads)
      .filter((entry): entry is [string, { url: string }] => typeof (entry[1] as any)?.url === 'string')
      .map(([format, info]) => ({ format, url: info.url }));
  } catch {
    return [];
  }
}

// Exchanges one format's "ticket" URL (from getBandcampFreeDownloadFormats)
// for the real, directly downloadable CDN URL — Bandcamp's own frontend
// does this same indirection via its `/statdownload/` endpoint before ever
// handing a download link to the browser, so a plain GET of the ticket URL
// itself doesn't work. Response is normally plain JSON, but at least the
// error path comes back as a `Downloads.statResult({...})`-style JSONP
// callback body per prior reverse-engineering of this flow, so both shapes
// are handled here rather than assuming success is always bare JSON too.
async function resolveBandcampStatDownload(ticketUrl: string): Promise<string | null> {
  // The exact derivation of `.rand` is undocumented (Bandcamp's own frontend
  // JS just needs *some* cache-busting value here); current timestamp is
  // what every known reimplementation of this flow uses and it works.
  const statUrl = `${ticketUrl.replace('/download/', '/statdownload/')}&.rand=${Date.now()}&.vrs=1`;

  let text: string;
  try {
    const res = await fetchWithTimeout(statUrl, {
      headers: { 'User-Agent': BANDCAMP_USER_AGENT, Referer: 'https://bandcamp.com/' },
    });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }

  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('{') ? trimmed : trimmed.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, '');
  try {
    const data = JSON.parse(jsonText);
    return typeof data?.download_url === 'string' ? data.download_url : null;
  } catch {
    return null;
  }
}

// Preference order when a free-download track offers more than one format —
// every candidate still ends up funneled through transcodeToMp3 into this
// app's uniform 320kbps mp3 (see bandcampReplace.ts), so the only thing that
// matters here is starting from the least lossy source actually available.
// flac and wav are both lossless (flac is just wav's PCM samples losslessly
// compressed — ffmpeg decodes either back to the exact same audio), so
// either makes an equally good transcode source; flac is tried first purely
// because it's the smaller download for the same result, not because it's
// higher quality. mp3-320 is lossy and only used when neither lossless
// option is offered.
const FREE_DOWNLOAD_FORMAT_PREFERENCE = ['flac', 'wav', 'mp3-320'];

export interface BandcampFreeDownload {
  url: string;
  format: string;
}

// Resolves a free-download-enabled track (details.freeDownloadPage from
// getBandcampTrackDetails) all the way through to a real downloadable file
// URL, at the best quality Bandcamp actually offers for it — this is the one
// path in this provider that can exceed BANDCAMP_STREAM_BITRATE_KBPS at all.
// Returns null for anything that isn't marked free-download (the common
// case: most Bandcamp content is either paid outright or "name your price"
// behind an email-confirmed checkout, neither of which this app attempts to
// work around) as well as any failure along the multi-step chain above.
export async function getBandcampFreeDownloadUrl(freeDownloadPageUrl: string): Promise<BandcampFreeDownload | null> {
  if (!isOnline()) return null;

  const formats = await getBandcampFreeDownloadFormats(freeDownloadPageUrl);
  if (formats.length === 0) return null;

  for (const preferred of FREE_DOWNLOAD_FORMAT_PREFERENCE) {
    const match = formats.find((f) => f.format === preferred);
    if (!match) continue;
    const resolvedUrl = await resolveBandcampStatDownload(match.url);
    if (resolvedUrl) return { url: resolvedUrl, format: preferred };
  }

  return null;
}
