import type { HlsQualityInfo, Quality } from './types';

/** Default public hifi-api instances (ordered by preference). */
export const DEFAULT_INSTANCES: readonly string[] = [
  'https://triton.squid.wtf',
  'https://hifi-one.spotisaver.net',
  'https://hifi-two.spotisaver.net',
  'https://hund.qqdl.site',
  'https://katze.qqdl.site',
  'https://arran.monochrome.tf',
  'https://us-west.monochrome.tf',
];

/** Quality tiers tried in order, highest first. */
export const QUALITY_FALLBACK_CHAIN: readonly Quality[] = ['hires', 'lossless', 'high', 'low'];

/** HLS quality presets mapping to /trackManifests/ format parameters. */
export const HLS_QUALITY_MAP: Record<Quality, HlsQualityInfo> = {
  hires: {
    formats: ['FLAC_HIRES'],
    manifestType: 'HLS',
    extension: 'flac',
    label: 'FLAC 24-bit/96kHz',
    bitrate: 9216,
    codec: 'flac',
  },
  lossless: {
    formats: ['FLAC'],
    manifestType: 'HLS',
    extension: 'flac',
    label: 'FLAC 16-bit/44.1kHz',
    bitrate: 1411,
    codec: 'flac',
  },
  high: {
    formats: ['AACLC'],
    manifestType: 'HLS',
    extension: 'm4a',
    label: 'AAC 320kbps',
    bitrate: 320,
    codec: 'aac',
  },
  low: {
    formats: ['HEAACV1'],
    manifestType: 'HLS',
    extension: 'm4a',
    label: 'AAC 96kbps',
    bitrate: 96,
    codec: 'aac',
  },
};

/** Quality key -> legacy /track/ endpoint `quality` param. */
export const TRACK_ENDPOINT_QUALITY_MAP: Record<Quality, string> = {
  hires: 'HI_RES_LOSSLESS',
  lossless: 'LOSSLESS',
  high: 'HIGH',
  low: 'LOW',
};

/** A media playlist whose total runtime is below this fraction of the track's real
 * duration is a preview (some instances only have 30s Tidal DOWNLOAD access — a
 * 220s track comes back as ~30s of segments + ENDLIST). */
export const PREVIEW_DURATION_RATIO = 0.85;

/** Files smaller than this are treated as failed downloads. */
export const MIN_AUDIO_BYTES = 100 * 1024;

export const DEFAULT_MIN_REQUEST_INTERVAL_MS = 500;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_MANIFEST_TIMEOUT_MS = 20_000;
export const DEFAULT_PLAYLIST_TIMEOUT_MS = 30_000;
export const DEFAULT_SEGMENT_TIMEOUT_MS = 30_000;
export const DEFAULT_SEGMENT_MAX_RETRIES = 3;
export const DEFAULT_SEGMENT_RETRY_DELAY_MS = 2000;
export const DEFAULT_USER_AGENT = 'ympv-backend-hifi/1.0';
