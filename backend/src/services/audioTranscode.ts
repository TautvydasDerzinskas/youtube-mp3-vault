import { spawn } from 'child_process';

// Generous ceiling for transcoding one track locally — CPU-bound, not
// network-bound, but a stuck/hung ffmpeg process (bad input, disk full)
// still shouldn't be able to hang the calling sync pass forever, same
// rationale as other per-track timeouts throughout this app.
const FFMPEG_TIMEOUT_MS = 5 * 60_000;

// Transcodes an arbitrary audio file (flac/wav/m4a/aac/whatever an external
// source handed back) to a 320kbps CBR mp3 — this app's library is mp3-only
// throughout, so every non-YouTube source (Soulseek lossless files,
// JioSaavn's AAC streams) gets normalized through here rather than trusting
// the source's own format/extension claims. ffmpeg is already present in the
// production image for yt-dlp's own audio extraction (see Dockerfile), so
// this adds no new runtime dependency.
export function transcodeToMp3(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-b:a', '320k', outputPath]);
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      resolve(false);
    }, FFMPEG_TIMEOUT_MS);

    proc.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
