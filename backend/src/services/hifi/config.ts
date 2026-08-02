import {
  DEFAULT_INSTANCES,
  DEFAULT_MANIFEST_TIMEOUT_MS,
  DEFAULT_MIN_REQUEST_INTERVAL_MS,
  DEFAULT_PLAYLIST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SEGMENT_MAX_RETRIES,
  DEFAULT_SEGMENT_RETRY_DELAY_MS,
  DEFAULT_SEGMENT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MIN_AUDIO_BYTES,
  PREVIEW_DURATION_RATIO,
} from './constants';
import type { HiFiClientConfig } from './types';

export function defaultConfig(): HiFiClientConfig {
  return {
    instances: [...DEFAULT_INSTANCES],
    downloadPath: '',
    minRequestIntervalMs: DEFAULT_MIN_REQUEST_INTERVAL_MS,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    manifestTimeoutMs: DEFAULT_MANIFEST_TIMEOUT_MS,
    playlistTimeoutMs: DEFAULT_PLAYLIST_TIMEOUT_MS,
    segmentTimeoutMs: DEFAULT_SEGMENT_TIMEOUT_MS,
    segmentMaxRetries: DEFAULT_SEGMENT_MAX_RETRIES,
    segmentRetryDelayMs: DEFAULT_SEGMENT_RETRY_DELAY_MS,
    userAgent: DEFAULT_USER_AGENT,
    previewDurationRatio: PREVIEW_DURATION_RATIO,
    minAudioBytes: MIN_AUDIO_BYTES,
    preferredQuality: 'lossless',
    allowQualityFallback: true,
  };
}

export function resolveConfig(overrides?: Partial<HiFiClientConfig>): HiFiClientConfig {
  const base = defaultConfig();
  return {
    ...base,
    ...overrides,
    instances: overrides?.instances && overrides.instances.length > 0 ? [...overrides.instances] : base.instances,
  };
}
