import type { InstancePool } from './instancePool';
import type { HiFiClientConfig } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

/** Rate-limited, failover-aware GET client for hifi-api instances.
 *
 * Rotates to the next instance on timeout, connection error, 5xx, 429
 * (rate-limited — another instance may serve immediately), and 403
 * (geo/auth-blocked per instance). 4xx/404/422 describe the request itself — no
 * instance would answer differently, so it fails fast instead of burning the pool.
 */
export class HiFiHttpClient {
  private lastCallAtMs = 0;
  private rateLimitQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly pool: InstancePool,
    private readonly config: HiFiClientConfig,
  ) {}

  private rateLimit(): Promise<void> {
    const run = this.rateLimitQueue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastCallAtMs;
      const wait = this.config.minRequestIntervalMs - elapsed;
      if (wait > 0) await sleep(wait);
      this.lastCallAtMs = Date.now();
    });
    // Never let one caller's rejection wedge the queue for the next.
    this.rateLimitQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private buildUrl(instance: string, path: string, params?: QueryParams): URL {
    const url = new URL(path, instance);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  /** GET `path` against the active instance, rotating and retrying on
   * instance-level failures until either a response comes back or the whole pool
   * has been tried. Returns null on total failure or an API-reported error.
   *
   * `externalSignal`, when given, bounds the *whole* call (every instance
   * attempt combined), not just one request — cycling the full pool at
   * `timeoutMs` each could otherwise take minutes if every instance is up but
   * slow, which defeats the purpose of a caller-imposed ceiling (e.g. "give up
   * on HiFi and fall back to another source" — see hifiReplace.ts). */
  async apiGet<T = unknown>(path: string, params?: QueryParams, timeoutMs?: number, externalSignal?: AbortSignal): Promise<T | null> {
    const timeout = timeoutMs ?? this.config.requestTimeoutMs;
    const tried = new Set<string>();

    for (;;) {
      if (externalSignal?.aborted) return null;

      const instance = this.pool.getCurrent();
      if (!instance || tried.has(instance)) {
        return null;
      }
      tried.add(instance);

      const url = this.buildUrl(instance, path, params);
      await this.rateLimit();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;

      try {
        const response = await fetch(url, {
          signal,
          headers: {
            'User-Agent': this.config.userAgent,
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          const status = response.status;
          if (status >= 500 || status === 403 || status === 429) {
            this.pool.rotate(instance);
            continue;
          }
          return null;
        }

        const data = (await response.json()) as unknown;
        if (data && typeof data === 'object' && 'error' in data && (data as Record<string, unknown>).error) {
          return null;
        }
        return data as T;
      } catch {
        // externalSignal firing surfaces here too (AbortSignal.any trips the
        // same catch) — in that case give up outright rather than rotating
        // into another attempt the caller's own deadline has already passed.
        if (externalSignal?.aborted) return null;
        // Otherwise a per-request timeout (AbortError) or network/connection
        // error — try the next instance.
        this.pool.rotate(instance);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
