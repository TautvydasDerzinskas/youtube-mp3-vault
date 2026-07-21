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
  /not available in your country/i,
  /blocked (it|this video) (on|in|for) copyright/i,
];

export function isPermanentlyUnavailable(message: string): boolean {
  return PERMANENT_UNAVAILABILITY_PATTERNS.some((re) => re.test(message));
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
