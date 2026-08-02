/** The source only has a preview/truncated clip of this track at every quality tier
 * tried — retrying at a lower tier would just re-download the same short clip
 * (and lossy tiers dodge the bitrate check), so callers should treat this as
 * "this source doesn't have the track", not "retry me". */
export class HiFiPreviewOnlyError extends Error {
  constructor(
    public readonly displayName: string,
    public readonly detail: string,
  ) {
    super(`HiFi only has a preview of "${displayName}" (${detail})`);
    this.name = 'HiFiPreviewOnlyError';
  }
}

/** A segment/direct-URL request came back with a 4xx status — retrying the same
 * URL won't help. */
export class SegmentHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`Segment request failed with HTTP ${status}: ${url}`);
    this.name = 'SegmentHttpError';
  }
}

/** No hifi-api instance produced a usable manifest at any quality tier. */
export class HiFiQualityExhaustedError extends Error {
  constructor(public readonly displayName: string) {
    super(`All quality tiers exhausted for "${displayName}"`);
    this.name = 'HiFiQualityExhaustedError';
  }
}

/** ffmpeg is required (FLAC demux, real-duration probing) but wasn't found. */
export class FfmpegNotFoundError extends Error {
  constructor() {
    super('ffmpeg is required for HiFi FLAC downloads. Install ffmpeg and ensure it is on PATH, or pass ffmpegPath.');
    this.name = 'FfmpegNotFoundError';
  }
}
