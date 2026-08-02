import { promises as fs } from 'fs';
import path from 'path';

import { probeAudioFile } from './audioProbe';
import { resolveConfig } from './config';
import { HLS_QUALITY_MAP, QUALITY_FALLBACK_CHAIN, TRACK_ENDPOINT_QUALITY_MAP } from './constants';
import { FfmpegNotFoundError, HiFiPreviewOnlyError, HiFiQualityExhaustedError, SegmentHttpError } from './errors';
import { demuxFlac, findFfmpeg, probeRealSeconds } from './ffmpeg';
import { parseHlsPlaylist } from './hlsPlaylist';
import { HiFiHttpClient } from './httpClient';
import { InstancePool } from './instancePool';
import { extensionFromLegacyManifest, extractLegacyManifestUrls, extractManifestUri, parseTrack, unwrapEnvelope } from './parsers';
import { isPreviewDownload, isPreviewPlaylist, isShortAudio, sumHlsSegmentSeconds } from './previewDetection';
import type {
  DownloadOptions,
  DownloadProgress,
  DownloadResult,
  HiFiClientConfig,
  HlsManifestInfo,
  LegacyManifestInfo,
  ManifestInfo,
  ParsedTrack,
  Quality,
  SearchTracksParams,
} from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeUnlink(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Searches and downloads lossless (Tidal-sourced) audio through public hifi-api
 * instances — no authentication required. Handles instance failover, HLS
 * manifest-based downloads, quality-tier fallback, FFmpeg FLAC demuxing, and
 * preview/truncation detection (some public instances only have 30s Tidal
 * DOWNLOAD access and silently serve a preview instead of the full track).
 *
 * Trimmed to what services/hifiReplace.ts actually needs — search + a
 * specific-track download. Matching against our own library (artist/title/
 * duration confidence tiers, shared with slskd and JioSaavn — see
 * trackMatching.ts) happens in hifiReplace.ts, not here.
 */
export class HiFiClient {
  private readonly config: HiFiClientConfig;
  private readonly pool: InstancePool;
  private readonly http: HiFiHttpClient;
  private readonly ffmpegPath: string | null;

  constructor(overrides?: Partial<HiFiClientConfig>) {
    this.config = resolveConfig(overrides);
    this.pool = new InstancePool(this.config.instances);
    this.http = new HiFiHttpClient(this.pool, this.config);
    this.ffmpegPath = findFfmpeg(this.config.ffmpegPath);
  }

  get hasFfmpeg(): boolean {
    return this.ffmpegPath !== null;
  }

  // ---------------------------------------------------------------------
  // Search / metadata
  // ---------------------------------------------------------------------

  async searchTracks(params: SearchTracksParams, signal?: AbortSignal): Promise<ParsedTrack[]> {
    const { title, artist, album, limit = 20 } = params;
    if (!title && !artist && !album) return [];

    const data = await this.http.apiGet<unknown>(
      '/search/',
      {
        limit,
        s: title,
        a: artist,
        al: album,
      },
      undefined,
      signal,
    );
    if (!data) return [];

    let items: unknown[] = [];
    const inner = unwrapEnvelope(data);
    if (Array.isArray(inner)) {
      items = inner;
    } else if (isRecord(inner)) {
      const list = inner.items ?? inner.tracks;
      if (Array.isArray(list)) items = list;
    }

    const results: ParsedTrack[] = [];
    for (const item of items) {
      try {
        results.push(parseTrack(item));
      } catch {
        // skip unparseable entries
      }
    }
    return results;
  }

  async getTrackInfo(trackId: number): Promise<ParsedTrack | null> {
    const data = await this.http.apiGet<unknown>('/info/', { id: trackId });
    if (!data) return null;
    const inner = unwrapEnvelope(data);
    if (!isRecord(inner)) return null;
    try {
      return parseTrack(inner);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Manifests
  // ---------------------------------------------------------------------

  private async fetchPlaylistText(uri: string): Promise<string> {
    const response = await fetch(uri, {
      redirect: 'follow',
      signal: AbortSignal.timeout(this.config.playlistTimeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching playlist ${uri}`);
    return response.text();
  }

  private async getHlsManifest(trackId: number, quality: Quality, expectedDurationSeconds: number): Promise<ManifestInfo | null> {
    const qualityInfo = HLS_QUALITY_MAP[quality];

    const data = await this.http.apiGet<unknown>(
      '/trackManifests/',
      {
        id: trackId,
        formats: qualityInfo.formats.join(','),
        usage: 'DOWNLOAD',
        manifestType: 'HLS',
        adaptive: 'true',
        uriScheme: 'HTTPS',
      },
      this.config.manifestTimeoutMs,
    );
    if (!data) return this.getLegacyTrackManifest(trackId, quality);

    const uri = extractManifestUri(data);
    if (uri === null) return this.getLegacyTrackManifest(trackId, quality);
    if (!uri) return null;

    let playlistText: string;
    try {
      playlistText = await this.fetchPlaylistText(uri);
    } catch {
      return null;
    }

    let parsed;
    try {
      parsed = parseHlsPlaylist(playlistText, uri);
    } catch {
      return null;
    }

    let mediaText = playlistText;
    let { initUri, segmentUris } = parsed;

    // A master playlist points at exactly one variant — follow it to reach the
    // actual media playlist.
    if (playlistText.includes('#EXT-X-STREAM-INF') && segmentUris.length > 0) {
      const variantUri = segmentUris[0]!;
      try {
        const variantText = await this.fetchPlaylistText(variantUri);
        mediaText = variantText;
        ({ initUri, segmentUris } = parseHlsPlaylist(variantText, variantUri));
      } catch {
        return null;
      }
    }

    // Preview detection — some instances only have 30s Tidal DOWNLOAD access,
    // returning a playlist far shorter than the real track. Decline it (and
    // rotate the instance) so the caller can fall through to a real source
    // instead of fetching a 30s file.
    const playlistSeconds = sumHlsSegmentSeconds(mediaText);
    if (isPreviewPlaylist(playlistSeconds, expectedDurationSeconds, this.config.previewDurationRatio)) {
      const current = this.pool.getCurrent();
      if (current) this.pool.rotate(current);
      return null;
    }

    const manifest: HlsManifestInfo = {
      kind: 'hls',
      initUri,
      segmentUris,
      extension: qualityInfo.extension,
      codec: qualityInfo.codec,
      quality,
      manifestDurationSeconds: playlistSeconds,
    };
    return manifest;
  }

  private async getLegacyTrackManifest(trackId: number, quality: Quality): Promise<LegacyManifestInfo | null> {
    const qualityInfo = HLS_QUALITY_MAP[quality];
    const apiQuality = TRACK_ENDPOINT_QUALITY_MAP[quality];

    const data = await this.http.apiGet<unknown>('/track/', { id: trackId, quality: apiQuality }, this.config.manifestTimeoutMs);
    if (!data) return null;

    const directUrls = extractLegacyManifestUrls(data);
    if (directUrls.length === 0) return null;

    return {
      kind: 'legacy',
      directUrls,
      extension: extensionFromLegacyManifest(data, qualityInfo.extension),
      codec: qualityInfo.codec,
      quality,
    };
  }

  // ---------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------

  private async downloadSegmentWithRetry(url: string, signal?: AbortSignal): Promise<Buffer> {
    const maxAttempts = this.config.segmentMaxRetries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: signal ?? AbortSignal.timeout(this.config.segmentTimeoutMs),
        });
        if (response.ok) {
          return Buffer.from(await response.arrayBuffer());
        }
        throw new SegmentHttpError(response.status, url);
      } catch (err) {
        if (err instanceof SegmentHttpError && err.status >= 400 && err.status < 500) {
          throw err; // the request itself is bad — retrying won't help
        }
        lastError = err;
      }

      if (attempt < maxAttempts - 1) {
        await sleep(this.config.segmentRetryDelayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to download segment: ${url}`);
  }

  private reportProgress(
    options: DownloadOptions,
    downloadedBytes: number,
    segmentsCompleted: number,
    totalSegments: number,
    speedStartMs: number,
  ): void {
    if (!options.onProgress) return;

    const elapsedSeconds = (Date.now() - speedStartMs) / 1000;
    const speedBytesPerSecond = elapsedSeconds > 0 ? downloadedBytes / elapsedSeconds : 0;
    const progressPercent = totalSegments > 0 ? Math.min((segmentsCompleted / totalSegments) * 100, 99.9) : 0;

    let etaSeconds: number | null = null;
    if (speedBytesPerSecond > 0 && segmentsCompleted > 0) {
      const remainingBytes = downloadedBytes * (totalSegments / segmentsCompleted) - downloadedBytes;
      if (remainingBytes > 0) etaSeconds = remainingBytes / speedBytesPerSecond;
    }

    const progress: DownloadProgress = {
      downloadedBytes,
      segmentsCompleted,
      totalSegments,
      speedBytesPerSecond,
      progressPercent,
      etaSeconds,
    };
    options.onProgress(progress);
  }

  /**
   * Download one track by its hifi-api track ID, cascading down quality tiers on
   * failure or preview detection. `displayName` becomes the output filename stem
   * (sanitized) — pass e.g. `"${artist} - ${title}"`.
   */
  async downloadTrack(trackId: number, displayName: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    const preferredQuality = options.quality ?? this.config.preferredQuality;
    const allowFallback = options.allowFallback ?? this.config.allowQualityFallback;
    const startIndex = QUALITY_FALLBACK_CHAIN.indexOf(preferredQuality);
    const chain: Quality[] = allowFallback
      ? QUALITY_FALLBACK_CHAIN.slice(startIndex === -1 ? 1 : startIndex)
      : [preferredQuality];

    // Expected track length drives every preview/truncation guard below. Best
    // effort: 0 just disables the duration checks, it never rejects on its own.
    let trackInfo: ParsedTrack | null = null;
    try {
      trackInfo = await this.getTrackInfo(trackId);
    } catch {
      trackInfo = null;
    }
    const expectedSeconds = trackInfo ? trackInfo.durationMs / 1000 : 0;

    const minAudioBytes = this.config.minAudioBytes;
    const safeName = displayName.replace(/[<>:"/\\|?*]/g, '_');
    await fs.mkdir(this.config.downloadPath, { recursive: true });

    for (const qualityKey of chain) {
      if (options.signal?.aborted) throw new DOMException('Download aborted', 'AbortError');

      const manifestInfo = await this.getHlsManifest(trackId, qualityKey, expectedSeconds);
      if (!manifestInfo) continue;

      const segmentUris = manifestInfo.kind === 'hls' ? manifestInfo.segmentUris : manifestInfo.directUrls;
      if (segmentUris.length === 0) continue;

      if (manifestInfo.kind === 'hls') {
        // Preview guard #1 (pre-download): a preview manifest serves only ~30s of
        // segments for a full-length track. That means THIS SOURCE only has a
        // preview — lower quality tiers are the SAME preview — so give up on
        // HiFi entirely rather than landing a lower-tier preview.
        if (isShortAudio(manifestInfo.manifestDurationSeconds, expectedSeconds)) {
          throw new HiFiPreviewOnlyError(
            displayName,
            `manifest ${manifestInfo.manifestDurationSeconds.toFixed(0)}s of ${expectedSeconds.toFixed(0)}s at ${qualityKey}`,
          );
        }
      }

      const extension = manifestInfo.extension;
      const outPath = path.join(this.config.downloadPath, `${safeName}.${extension}`);
      const isDirect = manifestInfo.kind === 'legacy';
      const isFlac = (qualityKey === 'hires' || qualityKey === 'lossless') && !isDirect;
      const intermediatePath = isFlac ? outPath.replace(new RegExp(`\\.${extension}$`), '.m4a') : outPath;

      let downloaded = 0;
      let segmentsCompleted = 0;
      const speedStart = Date.now();
      const initUri = manifestInfo.kind === 'hls' ? manifestInfo.initUri : null;
      const totalSegments = segmentUris.length + (initUri ? 1 : 0);

      try {
        const handle = await fs.open(intermediatePath, 'w');
        try {
          if (initUri) {
            if (options.signal?.aborted) throw new DOMException('Download aborted', 'AbortError');
            const initData = await this.downloadSegmentWithRetry(initUri, options.signal);
            await handle.write(initData);
            downloaded += initData.length;
            segmentsCompleted += 1;
            this.reportProgress(options, downloaded, segmentsCompleted, totalSegments, speedStart);
          }

          for (const segmentUrl of segmentUris) {
            if (options.signal?.aborted) throw new DOMException('Download aborted', 'AbortError');
            const segmentData = await this.downloadSegmentWithRetry(segmentUrl, options.signal);
            await handle.write(segmentData);
            downloaded += segmentData.length;
            segmentsCompleted += 1;
            this.reportProgress(options, downloaded, segmentsCompleted, totalSegments, speedStart);
          }
        } finally {
          await handle.close();
        }
      } catch (err) {
        await safeUnlink(intermediatePath);
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        continue; // try next quality tier
      }

      if (downloaded < minAudioBytes) {
        await safeUnlink(intermediatePath);
        continue;
      }

      try {
        let finalSize: number;
        if (isFlac) {
          if (!this.ffmpegPath) throw new FfmpegNotFoundError();
          await demuxFlac(intermediatePath, outPath, this.ffmpegPath);
          await safeUnlink(intermediatePath);
          finalSize = (await fs.stat(outPath).catch(() => null))?.size ?? 0;
        } else {
          finalSize = (await fs.stat(intermediatePath).catch(() => null))?.size ?? 0;
        }

        if (finalSize < minAudioBytes) {
          await safeUnlink(outPath);
          continue;
        }

        // Preview guard #2 (post-download): the real catch. HiFi previews fake
        // the full length in every header (manifest EXTINF, m4a moov, FLAC
        // total_samples), so only the decoded audio (or, for lossless, the
        // implied bitrate) reveals the ~30s truth. Reference = the largest
        // length any header claims, so the file's own faked claim becomes the
        // bar its real audio must clear.
        const probed = await probeAudioFile(outPath);
        const referenceSeconds = Math.max(expectedSeconds, probed?.durationSeconds ?? 0);
        const realSeconds = this.ffmpegPath ? await probeRealSeconds(outPath, this.ffmpegPath) : 0;

        const { isFake, reason } = isPreviewDownload({
          realSeconds,
          referenceSeconds,
          isLossless: isFlac,
          sizeBytes: finalSize,
          sampleRate: probed?.sampleRate ?? 0,
          bitsPerSample: probed?.bitsPerSample ?? 0,
          channels: probed?.channels ?? 0,
        });

        if (isFake) {
          await safeUnlink(outPath);
          // A preview at this tier means the SOURCE only has a preview — every
          // lower tier is the same clip (and lossy ones dodge the bitrate
          // check) — so give up on HiFi rather than cascading into an
          // accepted lower-tier preview.
          throw new HiFiPreviewOnlyError(displayName, `${reason} at ${qualityKey}`);
        }

        return { filePath: outPath, quality: qualityKey, bytes: finalSize, track: trackInfo ?? emptyTrack(trackId, displayName) };
      } catch (err) {
        if (err instanceof HiFiPreviewOnlyError) throw err;
        await safeUnlink(outPath);
        await safeUnlink(intermediatePath);
        continue;
      }
    }

    throw new HiFiQualityExhaustedError(displayName);
  }
}

function emptyTrack(id: number, displayName: string): ParsedTrack {
  return {
    id,
    artistId: null,
    albumId: null,
    title: displayName,
    artist: '',
    album: '',
    durationMs: 0,
    trackNumber: null,
    isrc: null,
    bpm: null,
    copyright: null,
    explicit: false,
    quality: '',
  };
}
