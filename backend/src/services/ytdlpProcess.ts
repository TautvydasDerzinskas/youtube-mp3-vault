import { spawn } from 'child_process';

export interface YtDlpResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

// yt-dlp has no built-in ceiling of its own — a stalled network read or a
// bot-protection standoff can otherwise hang the calling sync/retry/search
// pass forever (the underlying process just never emits 'close'). Shared by
// every yt-dlp call site (downloader.ts, youtube.ts) so the same watchdog —
// forcibly kill and reject once `timeoutMs` elapses — only has to be
// written once.
export function runYtDlp(args: string[], timeoutMs: number): Promise<YtDlpResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    let settled = false;

    // proc.kill() still lets 'close' fire once the OS actually tears the
    // process down — this guard makes sure that doesn't also try to resolve
    // after the timeout has already rejected.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(Object.assign(
        new Error(`yt-dlp timed out after ${Math.round(timeoutMs / 1000)}s and was killed`),
        { code: 'YTDLP_TIMEOUT' },
      ));
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        err.code === 'ENOENT'
          ? Object.assign(new Error('yt-dlp is not installed or not in PATH'), { code: 'YTDLP_NOT_FOUND' })
          : err
      );
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
