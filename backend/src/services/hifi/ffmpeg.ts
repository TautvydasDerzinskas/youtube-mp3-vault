import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';

import { parseFfmpegTime } from './previewDetection';

/** Locate an ffmpeg binary: an explicit path if given and valid, else the first
 * match on PATH. Returns null if ffmpeg isn't available anywhere. */
export function findFfmpeg(explicitPath?: string): string | null {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;

  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';

  const result = spawnSync(lookupCommand, [binaryName], { encoding: 'utf-8' });
  if (result.status === 0) {
    const found = result.stdout.split(/\r?\n/)[0]?.trim();
    if (found) return found;
  }
  return null;
}

/** Real decoded audio length via ffmpeg — decodes the actual frames, so it sees
 * through a faked STREAMINFO/container duration (a 30s preview claiming full length
 * decodes to 30s). 0 if ffmpeg errors, times out, or produces no time= lines. */
export function probeRealSeconds(filePath: string, ffmpegPath: string, timeoutMs = 180_000): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', filePath, '-map', '0:a:0', '-f', 'null', '-']);

    let stderr = '';
    let settled = false;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      finish(0);
    }, timeoutMs);

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('close', () => finish(parseFfmpegTime(stderr)));
    proc.on('error', () => finish(0));
  });
}

/** Demux a FLAC elementary stream out of an MP4/M4A container without re-encoding. */
export function demuxFlac(inputPath: string, outputPath: string, ffmpegPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-map',
      '0:a:0',
      '-c',
      'copy',
      outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed while demuxing ${inputPath} -> ${outputPath}: ${code}\n${stderr}`));
      }
    });
    proc.on('error', reject);
  });
}
