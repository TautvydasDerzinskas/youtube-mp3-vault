// Public surface of the Qobuz fallback source — the only file the rest of
// the backend (hqReplace.ts) should import from this directory. Everything
// else in services/qobuz/ is plumbing ported from qobuz_module (see that
// port's own file-level comments for what changed and why). Callers must
// already have confirmed the playlist owner opted in (User.qobuzHqEnabled)
// before calling this — see slskdQualityWorker.ts. Verification itself is
// completed by that opted-in user in their own browser when needed (see
// session.ts + routes/hq.ts), never blocking this call for more than a fast
// bootstrap round-trip.
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { isOnline } from '../connectivity';
import { ensureSharedDirs, getTmpDir } from '../downloader';
import { searchQobuzByText, MIN_CONFIDENT_SCORE, ScoredQobuzTrack } from './search';
import { getQobuzCommunityDownloadURLFor } from './download';
import { ensureCommunitySession } from './session';
import { CommunityCooldownError } from './communityStatus';
import { QOBUZ_USER_AGENT } from './credentials';

export interface QobuzMatch {
  tempFilePath: string;
  sizeBytes: number;
  trackId: number;
  score: number;
  matchedArtist: string;
  matchedTitle: string;
}

async function selectBestMatch(artist: string, title: string): Promise<ScoredQobuzTrack | null> {
  const results = await searchQobuzByText(title, artist);
  if (results.length === 0) {
    console.log(`[qobuz] No search results for "${artist} - ${title}"`);
    return null;
  }
  const best = results[0];
  if (best.score < MIN_CONFIDENT_SCORE) {
    console.log(
      `[qobuz] Best match for "${artist} - ${title}" scored ${best.score} ` +
      `(needs ${MIN_CONFIDENT_SCORE}) — "${best.displayArtist} - ${best.displayTitle}", skipping`,
    );
    return null;
  }
  console.log(`[qobuz] Matched "${artist} - ${title}" -> "${best.displayArtist} - ${best.displayTitle}" (score ${best.score})`);
  return best;
}

// Mirrors qobuz.go's hi-res -> lossless fallback chain: try the requested
// quality tier first, and if the community backend can't serve it (anything
// other than a cooldown condition, which should propagate as-is rather than
// being swallowed by a pointless second attempt), retry once at plain
// lossless ("6") before giving up.
async function resolveDownloadURL(trackId: number, qualityCode: string): Promise<string> {
  try {
    return await getQobuzCommunityDownloadURLFor(trackId, qualityCode);
  } catch (err) {
    if (err instanceof CommunityCooldownError) throw err;
    if (qualityCode !== '6') {
      return await getQobuzCommunityDownloadURLFor(trackId, '6');
    }
    throw err;
  }
}

/**
 * Searches Qobuz by artist/title, and if a confident match exists (see
 * MIN_CONFIDENT_SCORE — the same bar qobuz_module's unattended auto-fetch
 * flow used), downloads the FLAC to a scratch temp file and returns it.
 *
 * Never throws — same contract as slskd.ts's findBetterQualityMp3/
 * findExactMatchCandidate. Everything from "not online" to "nothing
 * confident enough" to a hard failure (community backend down, verification
 * not completed yet, network error, anything at all) degrades to null,
 * logged along the way. This is a best-effort fallback source; nothing
 * about it — including the Qobuz community server being unreachable —
 * should ever be able to take the sync process down with it.
 */
export async function downloadBestMatchFromQobuz(artist: string, title: string): Promise<QobuzMatch | null> {
  if (!isOnline()) return null;
  const trimmedArtist = artist.trim();
  const trimmedTitle = title.trim();
  if (!trimmedArtist && !trimmedTitle) return null;

  try {
    // Fails fast on the same verification failure the actual download below
    // would eventually hit anyway, but before spending a search call — no
    // point scoring candidates for a track we can't download yet regardless.
    await ensureCommunitySession();

    const best = await selectBestMatch(trimmedArtist, trimmedTitle);
    if (!best) return null;

    const downloadURL = await resolveDownloadURL(best.track.id, '6');
    const upstream = await fetch(downloadURL, {
      headers: { 'User-Agent': QOBUZ_USER_AGENT, Accept: 'application/json, text/plain, */*' },
    });
    if (!upstream.ok || !upstream.body) {
      console.error(`[qobuz] FLAC download for track ${best.track.id} failed: HTTP ${upstream.status}`);
      return null;
    }

    await ensureSharedDirs();
    const tempFilePath = join(getTmpDir(), `qobuz-${randomUUID()}.flac`);
    await pipeline(Readable.fromWeb(upstream.body as never), createWriteStream(tempFilePath));
    const { size } = await stat(tempFilePath);
    console.log(`[qobuz] Downloaded "${best.displayArtist} - ${best.displayTitle}" — ${(size / 1024 / 1024).toFixed(1)}MB FLAC`);

    return {
      tempFilePath,
      sizeBytes: size,
      trackId: best.track.id,
      score: best.score,
      matchedArtist: best.displayArtist,
      matchedTitle: best.displayTitle,
    };
  } catch (err) {
    console.error(
      `[qobuz] Search/download failed for "${trimmedArtist} - ${trimmedTitle}" (Qobuz community server unreachable, ` +
      'verification failed, or another transient error):',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export async function cleanupQobuzTempFile(match: QobuzMatch): Promise<void> {
  await unlink(match.tempFilePath).catch(() => {});
}
