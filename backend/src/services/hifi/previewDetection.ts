/**
 * Preview/truncation guards.
 *
 * Some public hifi-api instances only have 30s Tidal DOWNLOAD access — a request
 * for a full 220s track silently comes back as ~30s of real audio, with every
 * length header (HLS EXTINF sum, m4a moov, FLAC total_samples) faked to the full
 * duration. These functions catch that at two points: before downloading (the
 * manifest's own advertised runtime) and after (the actually decoded audio).
 */

import { PREVIEW_DURATION_RATIO } from './constants';

const EXTINF_RE = /#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)/g;

/** Sum the #EXTINF segment durations in an HLS media playlist. 0 = no EXTINF lines
 * (master playlists, legacy manifests) — callers must treat 0 as "unknown", not "preview". */
export function sumHlsSegmentSeconds(playlistText: string): number {
  let total = 0;
  for (const match of (playlistText ?? '').matchAll(EXTINF_RE)) {
    const value = Number.parseFloat(match[1] ?? '');
    if (!Number.isNaN(value)) total += value;
  }
  return total;
}

/** True when the playlist runtime is far shorter than the track's real duration
 * (a preview). False when either duration is unknown, so a missing reference never
 * false-positives — the post-download audio guard is the safety net. */
export function isPreviewPlaylist(
  playlistSeconds: number,
  trackSeconds: number,
  ratio: number = PREVIEW_DURATION_RATIO,
): boolean {
  if (!playlistSeconds || !trackSeconds || trackSeconds <= 0) return false;
  return playlistSeconds < trackSeconds * ratio;
}

/** True when `actual` is meaningfully shorter than `expected` — a preview clip or a
 * truncated/corrupt download. Conservative: false whenever either value is missing/zero. */
export function isShortAudio(actualSeconds: number, expectedSeconds: number, threshold = 0.8): boolean {
  const a = actualSeconds || 0;
  const e = expectedSeconds || 0;
  if (a <= 0 || e <= 0) return false;
  return a < e * threshold;
}

/** True when a "lossless" file's data is far too small for its claimed length — the
 * fingerprint of a ~30s preview whose container was faked to the full duration. Real
 * FLAC is ~40-75% of raw PCM; a preview padded to full length implies single-digit %. */
export function isFakeLosslessBitrate(
  sizeBytes: number,
  claimedSeconds: number,
  sampleRate: number,
  bitsPerSample: number,
  channels: number,
  minRatio = 0.3,
): boolean {
  const sz = sizeBytes || 0;
  const secs = claimedSeconds || 0;
  const sr = sampleRate || 0;
  const bits = bitsPerSample || 0;
  const ch = channels || 0;
  if (sz <= 0 || secs <= 0 || sr <= 0 || bits <= 0 || ch <= 0) return false;
  return (sz * 8) / secs < sr * bits * ch * minRatio;
}

const FFMPEG_TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;

/** The last `time=HH:MM:SS.xx` ffmpeg prints while decoding — the real decoded
 * length, immune to a faked container/STREAMINFO duration. 0 if not found. */
export function parseFfmpegTime(stderrText: string): number {
  let last = 0;
  for (const match of (stderrText ?? '').matchAll(FFMPEG_TIME_RE)) {
    const hours = Number.parseInt(match[1] ?? '0', 10);
    const minutes = Number.parseInt(match[2] ?? '0', 10);
    const seconds = Number.parseFloat(match[3] ?? '0');
    last = hours * 3600 + minutes * 60 + seconds;
  }
  return last;
}

export interface PreviewCheckInput {
  realSeconds: number;
  referenceSeconds: number;
  isLossless: boolean;
  sizeBytes: number;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

export interface PreviewCheckResult {
  isFake: boolean;
  reason: string;
}

/** Is a finished file a preview/truncated fake? Two independent signals, so it fires
 * even when the fakery declares full length at every layer:
 *   1. decoded length far below the reference (ground truth, when a decoder ran);
 *   2. for lossless, an impossibly-low implied bitrate (no decoder needed). */
export function isPreviewDownload(input: PreviewCheckInput): PreviewCheckResult {
  const { realSeconds, referenceSeconds, isLossless, sizeBytes, sampleRate, bitsPerSample, channels } = input;

  if (realSeconds && isShortAudio(realSeconds, referenceSeconds)) {
    return {
      isFake: true,
      reason: `decoded ${realSeconds.toFixed(0)}s of ${referenceSeconds.toFixed(0)}s`,
    };
  }

  if (isLossless && isFakeLosslessBitrate(sizeBytes, referenceSeconds, sampleRate, bitsPerSample, channels)) {
    const kbps = referenceSeconds ? (sizeBytes * 8) / referenceSeconds / 1000 : 0;
    return {
      isFake: true,
      reason: `${kbps.toFixed(0)}kbps lossless over ${referenceSeconds.toFixed(0)}s (far too low — a ~30s preview)`,
    };
  }

  return { isFake: false, reason: '' };
}
