/**
 * All shared types for the HiFi (Tidal-backed, via public hifi-api instances) HQ source.
 */

/** Quality tiers exposed by hifi-api's /trackManifests/ endpoint. */
export type Quality = 'hires' | 'lossless' | 'high' | 'low';

/** Audio codec family a quality tier decodes to. */
export type Codec = 'flac' | 'aac';

export interface HlsQualityInfo {
  /** hifi-api `formats` values to request, e.g. ['FLAC_HIRES']. */
  formats: string[];
  manifestType: 'HLS';
  /** Output file extension once post-processing is done. */
  extension: 'flac' | 'm4a';
  /** Human-readable label, e.g. "FLAC 24-bit/96kHz". */
  label: string;
  /** Nominal bitrate in kbps, used for display/metadata only. */
  bitrate: number;
  codec: Codec;
}

/** A track as returned by search/info endpoints, normalized to a flat shape. */
export interface ParsedTrack {
  id: number | null;
  artistId: number | null;
  albumId: number | null;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  trackNumber: number | null;
  isrc: string | null;
  bpm: number | null;
  copyright: string | null;
  explicit: boolean;
  quality: string;
}

export interface HlsManifestInfo {
  kind: 'hls';
  initUri: string | null;
  segmentUris: string[];
  extension: 'flac' | 'm4a';
  codec: Codec;
  quality: Quality;
  /** Sum of #EXTINF segment durations — the real audio length this manifest provides. */
  manifestDurationSeconds: number;
}

export interface LegacyManifestInfo {
  kind: 'legacy';
  directUrls: string[];
  extension: 'flac' | 'm4a';
  codec: Codec;
  quality: Quality;
}

export type ManifestInfo = HlsManifestInfo | LegacyManifestInfo;

export interface SearchTracksParams {
  title?: string;
  artist?: string;
  album?: string;
  limit?: number;
}

export interface DownloadProgress {
  downloadedBytes: number;
  segmentsCompleted: number;
  totalSegments: number;
  speedBytesPerSecond: number;
  progressPercent: number;
  etaSeconds: number | null;
}

export interface DownloadOptions {
  /** Starting quality tier. Defaults to config.preferredQuality. */
  quality?: Quality;
  /** Fall back to lower tiers on failure/preview. Defaults to config.allowQualityFallback. */
  allowFallback?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
}

export interface DownloadResult {
  filePath: string;
  quality: Quality;
  bytes: number;
  track: ParsedTrack;
}

export interface HiFiClientConfig {
  /** Public hifi-api instances to try, in priority order. */
  instances: string[];
  /** Directory downloaded files are written to. */
  downloadPath: string;
  /** Minimum spacing between API requests, to stay polite to public instances. */
  minRequestIntervalMs: number;
  /** Timeout for plain JSON API calls (search/, info/). */
  requestTimeoutMs: number;
  /** Timeout for the /trackManifests/ and legacy /track/ calls. */
  manifestTimeoutMs: number;
  /** Timeout for fetching an HLS (media/variant) playlist. */
  playlistTimeoutMs: number;
  /** Timeout for a single HLS segment / direct-URL download. */
  segmentTimeoutMs: number;
  /** Retries per segment beyond the first attempt. */
  segmentMaxRetries: number;
  /** Fixed backoff between segment retries. */
  segmentRetryDelayMs: number;
  userAgent: string;
  /** A manifest whose total runtime is below this fraction of the track's real duration is a preview. */
  previewDurationRatio: number;
  /** Files smaller than this are treated as failed downloads. */
  minAudioBytes: number;
  /** Quality tier to start from when none is passed per-call. */
  preferredQuality: Quality;
  /** Whether to cascade down the quality chain on failure when none is passed per-call. */
  allowQualityFallback: boolean;
  /** Explicit ffmpeg binary path. Falls back to PATH lookup when unset. */
  ffmpegPath?: string;
}
