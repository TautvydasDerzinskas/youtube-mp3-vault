import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { mkdir, unlink, rename, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';

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

export async function downloadVideo(
  videoId: string
): Promise<{ tempFilePath: string; fileSize: number; sourceBitrateKbps: number | null }> {
  await ensureSharedDirs();
  const tmpDir = getTmpDir();
  const attemptId = `${videoId}-${randomUUID()}`;
  const outputTemplate = join(tmpDir, `${attemptId}.%(ext)s`);
  const tempFilePath = join(tmpDir, `${attemptId}.mp3`);

  return new Promise<{ tempFilePath: string; fileSize: number; sourceBitrateKbps: number | null }>((resolve, reject) => {
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

    const proc = spawn('yt-dlp', args);
    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? Object.assign(new Error('yt-dlp not found'), { code: 'YTDLP_NOT_FOUND' })
          : err
      );
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp exited ${code}: ${stderr.slice(0, 300)}`));
      }
      const printedAbr = stdout.trim().split('\n').pop() ?? '';
      const sourceBitrateKbps = /^[\d.]+$/.test(printedAbr) ? Math.round(parseFloat(printedAbr)) : null;
      stat(tempFilePath)
        .then((s) => resolve({ tempFilePath, fileSize: s.size, sourceBitrateKbps }))
        .catch(reject);
    });
  });
}

export async function publishToSharedStore(tempFilePath: string, filename: string): Promise<void> {
  await rename(tempFilePath, getSharedFilePath(filename));
}
