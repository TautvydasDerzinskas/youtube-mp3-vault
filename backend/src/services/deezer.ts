import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable, Transform, TransformCallback } from 'stream';
import { Blowfish } from 'egoroof-blowfish';

// Ported from deezer-downloader's deezer_downloader/deezer.py (Python), the
// reference implementation this whole provider is based on. Deezer serves
// track audio Blowfish-CBC-encrypted (only every 3rd 2048-byte block of the
// stream is actually encrypted, the rest pass through untouched) — a scheme
// tied to Deezer's own private "gw-light" web API, not anything documented
// or officially supported. Every user of this provider supplies their own
// Deezer account cookie (the "arl" cookie) — see deezerReplace.ts and
// routes/auth.ts's /deezer endpoints — so this only ever streams tracks a
// user's own paid Deezer account is already entitled to play.

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0';

// Generous but bounded — same rationale as every other per-request network
// timeout in this app (see jiosaavn.ts/slskd.ts): a stalled request
// shouldn't hang the calling sync pass forever.
const FETCH_TIMEOUT_MS = 15_000;
const DOWNLOAD_FETCH_TIMEOUT_MS = 3 * 60_000;

// A long-lived, always-available track used purely to probe an account's
// capabilities — same track id the Python reference implementation's
// test_deezer_login() uses. Fetching its private track page both confirms
// the "arl" cookie is actually logged in (an anonymous/expired session's
// response is missing "MD5_ORIGIN" entirely, see below) and hands back a
// real TRACK_TOKEN, which is what get_song_url actually needs — reused here
// to probe which quality formats (FLAC / MP3_320) this account can stream
// without needing a second, unrelated song.
const PROBE_TRACK_ID = '917265';

function withCookie(arlCookie: string): string {
  return `arl=${arlCookie}; comeback=1`;
}

function commonHeaders(cookieHeader: string): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Cookie: cookieHeader,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export type DeezerFormat = 'FLAC' | 'MP3_320';

export interface DeezerSession {
  cookieHeader: string;
  licenseToken: string;
  // The best format this account is actually entitled to stream, determined
  // once at session-establishment time by probing PROBE_TRACK_ID rather than
  // trusting the account's advertised `web_sound_quality.lossless` flag
  // alone — that flag only reflects Hi-Fi/lossless entitlement, but a
  // regular Premium (non-Hi-Fi) account is still entitled to MP3_320, which
  // is exactly the other quality this app's HQ path accepts. Actually
  // resolving a get_url for each candidate format is the only way to tell
  // the two Premium tiers apart, since Deezer's API doesn't otherwise
  // surface "can this account stream MP3_320" as a discrete flag.
  format: DeezerFormat;
}

interface DeezerUserData {
  licenseToken: string;
  isLoggedIn: boolean;
  lossless: boolean;
}

async function getUserData(cookieHeader: string): Promise<DeezerUserData | null> {
  try {
    const res = await fetchWithTimeout(
      'https://www.deezer.com/ajax/gw-light.php?method=deezer.getUserData&input=3&api_version=1.0&api_token=',
      { headers: commonHeaders(cookieHeader) },
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const user = data?.results?.USER;
    const options = user?.OPTIONS;
    const licenseToken = options?.license_token;
    if (!licenseToken || typeof licenseToken !== 'string') return null;
    return {
      licenseToken,
      isLoggedIn: Number(user?.USER_ID ?? 0) !== 0,
      lossless: options?.web_sound_quality?.lossless === true,
    };
  } catch {
    return null;
  }
}

// Deezer embeds a page's data as a `{"DATA": ...}` JSON blob inside an
// inline <script> tag (DZR_APP_STATE) — same extraction the Python reference
// implementation's ScriptExtractor + regex does, minus the HTML-parsing step
// (unnecessary here: the JSON payload's own opening brace is a specific
// enough anchor that scanning the raw page text finds the same substring a
// script-tag walk would, and Deezer's page only ever embeds this once).
function extractDzrAppState(html: string): any | null {
  const match = html.match(/\{"DATA":.*/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

interface DeezerTrackToken {
  sngId: string;
  trackToken: string;
}

// Fetches a track's private page (needs a logged-in session) to recover the
// TRACK_TOKEN and SNG_ID get_song_url/the Blowfish key derivation need —
// neither is exposed by Deezer's public search API. Returns null for a
// track that's 404, region-blocked, or if the session isn't actually logged
// in (an expired/invalid "arl" cookie still gets a 200 response, just one
// missing "MD5_ORIGIN" anywhere in it — the same signal the reference
// implementation's Deezer403Exception is keyed on).
export async function getDeezerTrackToken(cookieHeader: string, trackId: string): Promise<DeezerTrackToken | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://www.deezer.com/us/track/${trackId}`, { headers: commonHeaders(cookieHeader) });
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  const html = await res.text();
  if (!html.includes('MD5_ORIGIN')) return null;

  const state = extractDzrAppState(html);
  const data = state?.DATA;
  if (!data?.SNG_ID || !data?.TRACK_TOKEN) return null;
  return { sngId: String(data.SNG_ID), trackToken: String(data.TRACK_TOKEN) };
}

async function getSongDownloadUrl(licenseToken: string, trackToken: string, format: DeezerFormat): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      'https://media.deezer.com/v1/get_url',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({
          license_token: licenseToken,
          media: [{ type: 'FULL', formats: [{ cipher: 'BF_CBC_STRIPE', format }] }],
          track_tokens: [trackToken],
        }),
      },
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const entry = data?.data?.[0];
    const url = entry?.media?.[0]?.sources?.[0]?.url;
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

// Confirms an "arl" cookie still logs in, independent of whether it's also
// entitled to any HQ format — used by resolvePlaylistQuality to check once
// per sync pass, before touching any real track, rather than re-discovering
// "this cookie is dead" from a failure on every single video (see
// slskdQualityWorker.ts).
export async function verifyDeezerLogin(arlCookie: string): Promise<boolean> {
  const cookieHeader = withCookie(arlCookie);
  const token = await getDeezerTrackToken(cookieHeader, PROBE_TRACK_ID);
  return token !== null;
}

// Establishes everything a sync pass needs from one "arl" cookie: confirms
// it's logged in, and determines the best quality format this specific
// account can actually stream (see DeezerSession.format above for why that
// can't just be read off web_sound_quality.lossless). Returns null for a
// dead cookie or an account with no HQ entitlement at all (e.g. a Free
// account, capped at 128kbps) — either way, this provider is a no-op for
// this user's sync pass, exactly as if they had no cookie configured.
export async function establishDeezerSession(arlCookie: string): Promise<DeezerSession | null> {
  if (!arlCookie.trim()) return null;
  const cookieHeader = withCookie(arlCookie);

  const probeToken = await getDeezerTrackToken(cookieHeader, PROBE_TRACK_ID);
  if (!probeToken) return null;

  const userData = await getUserData(cookieHeader);
  if (!userData || !userData.isLoggedIn) return null;

  const candidateFormats: DeezerFormat[] = userData.lossless ? ['FLAC', 'MP3_320'] : ['MP3_320'];
  for (const format of candidateFormats) {
    const url = await getSongDownloadUrl(userData.licenseToken, probeToken.trackToken, format);
    if (url) return { cookieHeader, licenseToken: userData.licenseToken, format };
  }
  return null;
}

export interface DeezerSearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number | null;
}

// Deezer's public search API — no cookie/login needed, used purely to find
// candidate ids to match against (see deezerReplace.ts's findDeezerCandidate).
// Actually downloading a match still needs getDeezerTrackToken separately,
// since this endpoint never exposes a TRACK_TOKEN.
export async function searchDeezerTracks(query: string, limit = 10): Promise<DeezerSearchResult[]> {
  const url = `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return [];
    const data: any = await res.json();
    const items: any[] = data?.data ?? [];
    return items.map((item): DeezerSearchResult => ({
      id: String(item.id),
      title: item.title ?? '',
      artist: item.artist?.name ?? '',
      album: item.album?.title ?? '',
      durationSec: typeof item.duration === 'number' ? item.duration : null,
    }));
  } catch {
    return [];
  }
}

// ─── Decryption ─────────────────────────────────────────────────────────

const ENCRYPTED_BLOCK_SIZE = 2048;
// Only every 3rd 2048-byte block of the stream is actually Blowfish-CBC
// encrypted (an original Deezer scheme, not anything we chose) — this
// mirrors the reference implementation's decryptfile() exactly, including
// that a final, shorter-than-2048-byte tail block is never decrypted
// (isWholeBlock in the Python source), matching however Deezer itself
// decided to (not) encrypt a track's trailing partial block.
const ENCRYPTED_BLOCK_STRIDE = 3;
const BLOWFISH_IV = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
const BLOWFISH_KEY_SEED = 'g4el58wc0zvf9na1';

// Deezer's per-track Blowfish key: XOR the first and second halves of
// md5(song_id) — hex-encoded, i.e. as ASCII text, not raw digest bytes, per
// the reference implementation — against a fixed seed. Every input byte
// here (hex digit chars '0'-'9'/'a'-'f' and the seed's own lowercase
// alnum chars) is low-ASCII with its top bit clear, so every XOR result is
// too — the key is always exactly 16 bytes. Still built the same way the
// Python source does it (`"".join(chr(...))` then `.encode()`) rather than
// as raw bytes directly, so this stays correct even if that low-ASCII
// assumption is ever wrong for some input this hasn't been tested against.
function calcBlowfishKey(sngId: string): Buffer {
  const seed = Buffer.from(BLOWFISH_KEY_SEED, 'ascii');
  const md5Hex = createHash('md5').update(sngId, 'utf8').digest('hex');
  const md5Bytes = Buffer.from(md5Hex, 'ascii');
  let keyChars = '';
  for (let i = 0; i < 16; i++) {
    keyChars += String.fromCharCode(md5Bytes[i] ^ md5Bytes[i + 16] ^ seed[i]);
  }
  return Buffer.from(keyChars, 'utf8');
}

// egoroof-blowfish's decode() always strips padding after decrypting,
// including in PADDING.NULL mode (trailing 0x00 bytes get silently removed)
// — appropriate for a single padded message, but wrong here: each 2048-byte
// chunk is a slice of a continuous audio stream with no real padding of its
// own, and genuine audio data legitimately ends in 0x00 bytes often enough
// that trusting the library's depad would silently corrupt output. Appending
// one throwaway 8-byte block before decoding sidesteps this entirely: CBC
// decryption of block N only ever depends on ciphertext blocks N and N-1, so
// appending an extra block can't change the decrypted value of any block
// before it — only the very last (fake) block can end up altered by depad,
// and that's always the block being thrown away below.
const DECRYPT_PADDING_GUARD = new Uint8Array(8);

function decryptBlock(bf: Blowfish, block: Uint8Array): Buffer {
  const padded = new Uint8Array(ENCRYPTED_BLOCK_SIZE + 8);
  padded.set(block, 0);
  padded.set(DECRYPT_PADDING_GUARD, ENCRYPTED_BLOCK_SIZE);
  const decoded = bf.decode(padded, Blowfish.TYPE.UINT8_ARRAY);
  return Buffer.from(decoded.subarray(0, ENCRYPTED_BLOCK_SIZE));
}

// Re-chunks an arbitrary network byte stream into fixed 2048-byte windows
// (independent of whatever chunk sizes the underlying TCP/fetch stream
// happens to deliver) and decrypts every 3rd one in place — a streaming
// port of decryptfile() from the Python reference implementation.
class DeezerDecryptStream extends Transform {
  private leftover = Buffer.alloc(0);
  private blockIndex = 0;
  private readonly bf: Blowfish;

  constructor(key: Buffer) {
    super();
    this.bf = new Blowfish(key, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
    this.bf.setIv(BLOWFISH_IV);
  }

  override _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
    this.leftover = Buffer.concat([this.leftover, chunk]);
    const outputs: Buffer[] = [];
    while (this.leftover.length >= ENCRYPTED_BLOCK_SIZE) {
      const block = this.leftover.subarray(0, ENCRYPTED_BLOCK_SIZE);
      this.leftover = this.leftover.subarray(ENCRYPTED_BLOCK_SIZE);
      const isEncrypted = this.blockIndex % ENCRYPTED_BLOCK_STRIDE === 0;
      outputs.push(isEncrypted ? decryptBlock(this.bf, block) : Buffer.from(block));
      this.blockIndex++;
    }
    callback(null, outputs.length > 0 ? Buffer.concat(outputs) : undefined);
  }

  override _flush(callback: TransformCallback): void {
    // A trailing partial block (file size isn't an exact multiple of 2048)
    // is never encrypted by Deezer in the first place — passed through as-is.
    callback(null, this.leftover.length > 0 ? this.leftover : undefined);
  }
}

// Downloads a Deezer media URL and decrypts it straight to `destPath` —
// works for both FLAC and MP3_320 sources (the cipher scheme is identical
// either way; only the file extension/eventual transcode decision differs,
// left to the caller, same division of responsibility as
// jiosaavnReplace.ts's downloadToFile + separate transcode step).
export async function downloadAndDecryptTrack(mediaUrl: string, sngId: string, destPath: string): Promise<void> {
  const res = await fetchWithTimeout(mediaUrl, { headers: { 'User-Agent': USER_AGENT } }, DOWNLOAD_FETCH_TIMEOUT_MS);
  if (!res.ok || !res.body) throw new Error(`Deezer media download failed: HTTP ${res.status}`);

  const key = calcBlowfishKey(sngId);
  await pipeline(Readable.fromWeb(res.body as any), new DeezerDecryptStream(key), createWriteStream(destPath));
}

export { getSongDownloadUrl };
