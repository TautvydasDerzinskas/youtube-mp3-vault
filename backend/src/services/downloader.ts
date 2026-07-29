import { randomUUID } from 'crypto';
import { mkdir, unlink, rename, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import { runYtDlp } from './ytdlpProcess';

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
  /confirm you'?re not a bot/i,
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
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',      // VBR ~245kbps — best quality
    '--no-playlist',
    '--no-warnings',
    '--embed-thumbnail',
    '--add-metadata',
    '--extractor-args', 'youtube:player_client=default,android,-tv',
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
