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

/**
 * Single shared store for downloaded MP3s — one physical file per YouTube video ID.
 * Named "library" (not "shared") to avoid colliding with slskd's SLSKD_SHARED_DIR,
 * which points at <musicDir>/shared on this same volume for its own Soulseek uploads.
 */
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

/**
 * Downloads a single YouTube video as best-quality MP3 using yt-dlp + ffmpeg,
 * into a private per-attempt temp file (never the canonical shared path
 * directly — the caller renames it into place once it's ready, so concurrent
 * downloads of the same video never interleave writes to the same file).
 */
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
      // The "web" client (yt-dlp's default) increasingly needs a PO token to avoid
      // 403s on the actual media URL; falling back through these clients dodges
      // most of that without requiring cookies. See yt-dlp/yt-dlp#14680, #16131.
      '--extractor-args', 'youtube:player_client=default,android,-tv',
      // Report the *source* stream's average bitrate, not our own transcode
      // target — --audio-quality 0 always aims for the same ~245kbps VBR
      // regardless of input, so measuring the output file can't tell a poor
      // original upload from a good one. abr reflects what YouTube actually had.
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

/**
 * Moves a completed temp download to its canonical shared-store path.
 * Atomic within the same filesystem — if two downloads of the same video
 * race here, the last rename simply wins with no partial/corrupt bytes,
 * and both sides produced equivalent content anyway.
 */
export async function publishToSharedStore(tempFilePath: string, filename: string): Promise<void> {
  await rename(tempFilePath, getSharedFilePath(filename));
}
