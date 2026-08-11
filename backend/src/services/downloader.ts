import { randomUUID } from 'crypto';
import { mkdir, unlink, rename, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import { runYtDlp, potProviderExtractorArgs } from './ytdlpProcess';
import { prisma } from './prisma';

/** Cross-platform safe filename — works on Windows, macOS, Android. */
export function sanitizeFilename(raw: string): string {
  return (
    raw
      // oxlint-disable-next-line no-control-regex -- stripping control chars from filenames is intentional here
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // reserved on Windows / Unix
      .replace(/\s+/g, ' ')                    // collapse whitespace
      .replace(/_{2,}/g, '_')                  // collapse underscores
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, '')         // no leading/trailing dots
      .substring(0, 180)                        // stay well under FS limits
  ) || 'untitled';
}

export function getSharedDir(): string {
  return join(config.musicDir, 'library');
}

/** Scratch space for in-flight downloads, kept separate so a half-written file never lands at its canonical name. */
export function getTmpDir(): string {
  return join(getSharedDir(), '.tmp');
}

export async function ensureSharedDirs(): Promise<void> {
  await mkdir(getTmpDir(), { recursive: true });
}

export function getSharedFilePath(filename: string): string {
  return join(getSharedDir(), filename);
}

export async function removeSharedFile(filename: string): Promise<void> {
  try {
    await unlink(getSharedFilePath(filename));
  } catch {
    // file may already be gone — ignore
  }
}

/** Renames a file already in the shared store, in place — no-op if the name isn't actually changing. */
export async function renameSharedFile(oldFilename: string, newFilename: string): Promise<void> {
  if (oldFilename === newFilename) return;
  await rename(getSharedFilePath(oldFilename), getSharedFilePath(newFilename));
}

// Human-readable on-disk filename ("Artist - Title.mp3") instead of the raw
// youtubeId — lets users copy files onto an MP3 player or share them without
// the name being meaningless. `artist` is expected to always be set in
// practice (see musicbrainz.ts's channel-name fallback), but a null/blank
// one still falls back to just the title rather than throwing, since a
// MediaFile can outlive whatever resolved its metadata.
export async function buildCleanFilename(artist: string | null, title: string, youtubeId: string): Promise<string> {
  const cleanArtist = artist ? sanitizeFilename(artist) : '';
  const cleanTitle = sanitizeFilename(title);
  const base = cleanArtist ? `${cleanArtist} - ${cleanTitle}` : cleanTitle;

  // MediaFile.filename is unique across the whole library (see schema.prisma)
  // — two different videos that happen to resolve to the same "Artist -
  // Title" need to be disambiguated. youtubeId is already a stable, unique
  // per-video identifier, so a short fragment of it is a deterministic
  // disambiguator that never collides with itself on a re-run.
  const collision = await prisma.mediaFile.findFirst({
    where: { filename: `${base}.mp3`, youtubeId: { not: youtubeId } },
    select: { id: true },
  });
  if (!collision) return `${base}.mp3`;
  return `${base} (${youtubeId.slice(-6)}).mp3`;
}

const PERMANENT_UNAVAILABILITY_PATTERNS = [
  /video (is )?unavailable/i,
  /this video is (no longer available|not available|private)/i,
  /private video/i,
  /video has been removed/i,
  /account associated with this video has been terminated/i,
  // yt-dlp's actual wording is "has not made this video available in your
  // country" — "not" and "available" aren't adjacent, so this can't anchor
  // on the literal "not available" phrase.
  /available in your country/i,
  /blocked (it|this video) (on|in|for) copyright/i,
  // yt-dlp has no audio (or any) format left to select for this video —
  // seen on livestream leftovers/deleted-then-reindexed videos. Not a
  // transient formats-list hiccup: the same request never yields a
  // different format on retry, so it belongs here rather than the
  // attempt-counter fallback.
  /requested format is not available/i,
];

export function isPermanentlyUnavailable(message: string): boolean {
  return PERMANENT_UNAVAILABILITY_PATTERNS.some((re) => re.test(message));
}

// yt-dlp's age-gate response ("Sign in to confirm your age..."). This is a
// per-video restriction, not IP throttling — we don't have a signed-in
// account's cookies configured, so it can never succeed. Kept distinct from
// RATE_LIMIT_PATTERNS below (whose "confirm you're not a bot" wording is
// superficially similar) so it doesn't trigger pacing escalation, and from
// PERMANENT_UNAVAILABILITY_PATTERNS so callers can drop the video outright
// instead of keeping it around hidden as isAvailable: false.
const AGE_RESTRICTED_PATTERN = /sign in to confirm your age/i;

export function isAgeRestricted(message: string): boolean {
  return AGE_RESTRICTED_PATTERN.test(message);
}

// Unambiguous signs that a failure is YouTube throttling/blocking us, rather
// than an ordinary transient error — a TLS handshake that never completes is
// a connection being throttled/dropped outright (a blunter response than a
// clean HTTP rejection), and the other two are YouTube's well-known explicit
// bot-check responses. Any one of these on its own is reason enough to back
// off hard immediately, rather than waiting for a streak of failures to
// accumulate first — see downloadPendingVideos in syncService.ts.
const RATE_LIMIT_PATTERNS = [
  /handshake operation timed out/i,
  /\b429\b/,
  /too many requests/i,
  // Deliberately anchored on "not a bot" rather than the full "confirm
  // you're not a bot" phrase — yt-dlp/YouTube's actual wording uses a curly
  // apostrophe (U+2019 "'", not the ASCII "'" this file's source is written
  // in), which silently broke a literal-apostrophe match here and let real
  // bot-check responses fall through to SIGN_IN_REQUIRED_PATTERN below,
  // wrongly treating a transient, IP-level block as a permanent per-video
  // one (isAvailable: false, hidden everywhere, never retried). "not a bot"
  // has no punctuation to get this wrong about and is specific enough on
  // its own not to false-positive on anything else.
  /not a bot/i,
];

export function isLikelyRateLimited(message: string): boolean {
  return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
}

// yt-dlp's youtube extractor funnels every YouTube-reported playability
// reason that mentions "sign in" through the same generic wrapper (append
// the --cookies-from-browser/--cookies hint) — that includes the age-gate
// and bot-check wordings above, but also a bare "Please sign in." for
// videos that require a signed-in account for some other reason (regional
// restriction, member-only-style gating, etc). We have no signed-in
// cookies configured, so any of these can never succeed no matter how many
// times it's retried — same as age-restriction. Excludes the age and
// bot-check patterns since those are already handled distinctly: bot-check
// in particular is IP-health signal, not a per-video dead end, so it must
// never be folded in here.
const SIGN_IN_REQUIRED_PATTERN = /sign in/i;

export function isSignInRequired(message: string): boolean {
  return SIGN_IN_REQUIRED_PATTERN.test(message) && !isAgeRestricted(message) && !isLikelyRateLimited(message);
}

// 10 minutes — generous ceiling for a single track even on a slow
// connection; yt-dlp's own --retries/--fragment-retries already absorb
// transient stalls within that window. Without this, a genuine network
// stall or bot-protection standoff would hang the calling sync/retry pass
// forever (see runYtDlp) — the per-video try/catch in
// syncService.ts's downloadPendingVideos then just marks this one video
// failed and moves on, same as any other download error.
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export async function downloadVideo(
  videoId: string
): Promise<{ tempFilePath: string; fileSize: number; sourceBitrateKbps: number | null }> {
  await ensureSharedDirs();
  const tmpDir = getTmpDir();
  const attemptId = `${videoId}-${randomUUID()}`;
  const outputTemplate = join(tmpDir, `${attemptId}.%(ext)s`);
  const tempFilePath = join(tmpDir, `${attemptId}.mp3`);

  const args = [
    // Without an explicit selector, yt-dlp's default format is a combined
    // video+audio stream, and -x then extracts whatever audio track happened
    // to be muxed into that — typically a lower-bitrate progressive-mp4
    // track (~128kbps AAC), not YouTube's actual best audio, which only
    // exists as a separate DASH audio-only stream (~160kbps Opus, usually).
    // Selecting bestaudio explicitly ensures that's the source getting
    // transcoded; /best is only a fallback for the rare video that has no
    // standalone audio stream at all.
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',      // VBR ~245kbps — best quality
    '--no-playlist',
    '--no-warnings',
    '--embed-thumbnail',
    '--add-metadata',
    '--extractor-args', 'youtube:player_client=default,android,-tv',
    ...potProviderExtractorArgs(),
    '--http-chunk-size', '10M',
    '--retries', '20',
    '--fragment-retries', '20',
    '--concurrent-fragments', '4',
    '--print', 'after_move:%(abr)s',
    '-o', outputTemplate,
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  const { code, stdout, stderr } = await runYtDlp(args, DOWNLOAD_TIMEOUT_MS);
  if (code !== 0) {
    throw new Error(`yt-dlp exited ${code}: ${stderr.slice(0, 300)}`);
  }
  const printedAbr = stdout.trim().split('\n').pop() ?? '';
  const sourceBitrateKbps = /^[\d.]+$/.test(printedAbr) ? Math.round(parseFloat(printedAbr)) : null;
  const s = await stat(tempFilePath);
  return { tempFilePath, fileSize: s.size, sourceBitrateKbps };
}

export async function publishToSharedStore(tempFilePath: string, filename: string): Promise<void> {
  await rename(tempFilePath, getSharedFilePath(filename));
}
