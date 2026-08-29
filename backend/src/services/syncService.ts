import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { fetchPlaylist } from './youtube';
import { downloadVideo, publishToSharedStore, removeSharedFile, isPermanentlyUnavailable, isLikelyRateLimited, isAgeRestricted, isSignInRequired } from './downloader';
import { resolvePlaylistMetadata } from './metadataWorker';
import { resolvePlaylistQuality } from './slskdQualityWorker';
import { matchingAutoDeleteGenre } from './autoDeleteGenres';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Adaptive pacing between downloads — see downloadPendingVideos. A large
// *batch* (however many videos this particular pass is actually about to
// attempt — pending count, not total playlist size; a retry-failed pass on
// a huge playlist might only be retrying a handful) gets a small proactive
// floor even with zero failures (cheap insurance against tripping a
// volume-based throttle in the first place); beyond that, pacing only
// escalates in response to actual trouble.
const LARGE_BATCH_THRESHOLD = 300;
const LARGE_BATCH_BASELINE_DELAY_MS = 3_000;

// Escalation ladder above the baseline. A trigger jumps straight to the
// first tier; if failures keep happening even at that pace, it escalates
// once more rather than retrying forever at a pace that's clearly not
// enough. Capped at 5 minutes — long enough to matter, short enough that a
// user who pauses mid-backoff isn't left waiting on an unreasonable delay.
const PACING_ESCALATION_MS = [3 * 60_000, 5 * 60_000];

// A single one of these (see isLikelyRateLimited) is reason enough to
// escalate immediately; anything else needs a streak this long first, since
// an occasional ordinary failure (a flaky request, a genuinely broken video)
// isn't evidence of IP-level trouble on its own.
const FAILURE_STREAK_TO_ESCALATE = 5;
// Consecutive successes at the current pace before easing back down one tier.
const SUCCESS_STREAK_TO_STEP_DOWN = 5;

// A video that fails this many times total (initial sync + retries alike,
// excluding permanently-unavailable ones which are never retried at all) is
// removed from the playlist outright rather than marked failed again — some
// failures aren't rate-limiting or bad luck, they're a video that will never
// succeed for reasons that don't match isPermanentlyUnavailable's known
// patterns, and retrying it forever every time "Retry failed" is clicked
// otherwise never actually converges.
const MAX_DOWNLOAD_ATTEMPTS = 3;

/** True for a Prisma unique-constraint violation (P2002) — i.e. we lost a create race. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** True for a Prisma FK-restrict violation (P2003) — i.e. some other row still references it. */
function isForeignKeyRestrictViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

// The three user-triggerable actions that produce a SyncReport (see below) —
// deliberately excludes the playlist-generation and soft-reimport flows,
// which already have their own admin-log entries and aren't what the
// Playlists page's stats modal is for.
export type SyncActionType = 'sync' | 'retry_failed' | 'scan_hq';

export interface SyncFailureDetail {
  title: string;
  reason: string;
  message: string;
}

// Defensive ceiling on SyncStats.failures below — a playlist whose sync run
// fails on hundreds/thousands of videos at once (a real yt-dlp outage, say)
// shouldn't turn one SyncReport row into an unbounded JSON blob just because
// failureReasons' bucket counts already summarize the total either way; the
// modal's own detail list is for "which specific videos, and why" on an
// ordinary run, not a full incident log.
const MAX_FAILURE_DETAILS = 50;

// Accumulated across a single run of downloadPendingVideos (and, for a full
// sync, refreshPlaylistFromYoutube right before it) and written out as one
// SyncReport row once the run finishes — see finalizeSyncReport. Mutated in
// place rather than rebuilt, since it's threaded through several functions
// that each only know about their own slice of the run.
export interface SyncStats {
  addedCount: number;
  removedCount: number;
  downloadedCount: number;
  recoveredCount: number;
  failedCount: number;
  failureReasons: Record<string, number>;
  // Per-video detail behind those bucket counts — capped at
  // MAX_FAILURE_DETAILS (failedCount itself is never capped, so the two can
  // diverge on a very large run; see the modal, which surfaces both).
  failures: SyncFailureDetail[];
  newHqCount: number;
}

function createSyncStats(): SyncStats {
  return {
    addedCount: 0, removedCount: 0, downloadedCount: 0, recoveredCount: 0,
    failedCount: 0, failureReasons: {}, failures: [], newHqCount: 0,
  };
}

// Buckets a download failure message into a stable, translatable category
// for the stats modal — mirrors the same message-sniffing helpers
// downloadPendingVideos already uses to decide pacing/permanence, just
// grouped for display instead of for retry logic.
function categorizeFailure(message: string): string {
  if (isAgeRestricted(message)) return 'age_restricted';
  if (isSignInRequired(message)) return 'sign_in_required';
  if (isPermanentlyUnavailable(message)) return 'unavailable';
  if (isLikelyRateLimited(message)) return 'rate_limited';
  return 'other';
}

// Writes the one SyncReport row for a completed run — called from
// downloadPendingVideos' finally block so it fires exactly once whether the
// run finished cleanly or hit its outer catch (a report with partial stats
// and a failedCount is still useful; the alternative is silently dropping
// it). Fire-and-forget from the caller's perspective: a failure to write the
// report must never be mistaken for the sync itself having failed, so
// errors are swallowed here rather than propagated.
async function finalizeSyncReport(params: {
  playlistId: string;
  actionType: SyncActionType;
  startedAt: number;
  stats: SyncStats;
}): Promise<void> {
  const { playlistId, actionType, startedAt, stats } = params;
  try {
    const playlist = await prisma.playlist.findUnique({ where: { id: playlistId }, select: { userId: true } });
    if (!playlist) return; // playlist was deleted mid-run — nothing to attach the report to
    await prisma.syncReport.create({
      data: {
        userId: playlist.userId,
        playlistId,
        actionType,
        startedAt: new Date(startedAt),
        durationMs: Date.now() - startedAt,
        addedCount: stats.addedCount,
        removedCount: stats.removedCount,
        downloadedCount: stats.downloadedCount,
        recoveredCount: stats.recoveredCount,
        failedCount: stats.failedCount,
        failureReasons: stats.failureReasons,
        failureDetails: stats.failures as unknown as Prisma.InputJsonValue,
        newHqCount: stats.newHqCount,
      },
    });
  } catch (err) {
    console.error(`[sync] Failed to write sync report for playlist ${playlistId}:`, err);
  }
}

async function resolveMediaFile(youtubeId: string) {
  const existing = await prisma.mediaFile.findUnique({ where: { youtubeId } });
  if (existing) return existing;

  const { tempFilePath, fileSize, sourceBitrateKbps } = await downloadVideo(youtubeId);
  const filename = `${youtubeId}.mp3`;
  await publishToSharedStore(tempFilePath, filename);

  try {
    return await prisma.mediaFile.create({
      data: { youtubeId, filename, fileSize, bitrate: sourceBitrateKbps },
    });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
    return await prisma.mediaFile.findUniqueOrThrow({ where: { youtubeId } });
  }
}

async function tryDeleteMediaFile(mediaFileId: string): Promise<void> {
  let mediaFile;
  try {
    mediaFile = await prisma.mediaFile.delete({ where: { id: mediaFileId } });
  } catch (err) {
    if (isForeignKeyRestrictViolation(err)) return; // still referenced elsewhere — leave it
    throw err;
  }
  await removeSharedFile(mediaFile.filename);
}

// In-memory guard — prevents concurrent syncs on the same playlist
const activeSyncs = new Set<string>();

export function isSyncing(playlistId: string): boolean {
  return activeSyncs.has(playlistId);
}

// Set only while actually sitting in a pacing delay between downloads (see
// downloadPendingVideos) — surfaced to the frontend so it can show a
// "Pacing…" message in the same slot the "Syncing #x/y" message otherwise
// occupies, rather than that line just disappearing (and the row's height
// along with it) for however long the gap lasts.
const pacingPlaylists = new Set<string>();

export function isPacing(playlistId: string): boolean {
  return pacingPlaylists.has(playlistId);
}

export interface SyncPhase {
  phase: 'metadata' | 'quality';
  current: number;
  total: number;
  title: string;
  // Ids of every video with a real, terminal verdict so far *this specific
  // pass* — oldest-first (i.e. processing order, since both workers walk
  // `position asc`). Deliberately not derived from qualityCheckStatus/
  // metadataStatus alone: those persist across passes, so under `rescanAll`
  // (Scan for HQ) a row already 'checked' from a past ordinary sync would
  // look "already done" even though this specific rescan hasn't reached it
  // yet. This list is the one thing that's accurate for both regular syncs
  // and rescans.
  processedIds: string[];
  // Subset of processedIds (quality phase only) that got a genuinely new HQ
  // upgrade this pass — same "genuinely new" definition as onHqFound below.
  hqFoundIds: string[];
}

// Once every video is downloaded, downloadPendingVideos still has metadata
// resolution and (optionally slow, since it involves real network searches
// and — with the HQ auto-download toggle on — real file transfers) HQ
// quality-checking left to do per video before syncStatus finally goes back
// to idle. Both used to be silent from the frontend's perspective — the
// progress bar was already at 100% and stayed there with nothing to
// distinguish "still genuinely working" from "stuck" — so
// resolvePlaylistMetadata/resolvePlaylistQuality report their per-video
// progress here, the same in-memory-only, no-DB-write pattern as
// pacingPlaylists above.
const syncPhases = new Map<string, SyncPhase>();

export function getSyncPhase(playlistId: string): SyncPhase | null {
  return syncPhases.get(playlistId) ?? null;
}

// Claims the same busy-slot regular syncing uses, for callers outside this
// file (see reimport.ts) that need to touch a playlist's videos without
// racing a real sync — or another such caller — on the same playlist.
// Returns false if it was already claimed.
export function tryClaimSync(playlistId: string): boolean {
  if (activeSyncs.has(playlistId)) return false;
  activeSyncs.add(playlistId);
  return true;
}

export function releaseSyncClaim(playlistId: string): void {
  activeSyncs.delete(playlistId);
}

export async function resetStuckSyncs(): Promise<void> {
  const [playlists, videos] = await Promise.all([
    prisma.playlist.updateMany({
      where: { syncStatus: { in: ['syncing', 'retrying'] } },
      data: { syncStatus: 'idle' },
    }),
    prisma.playlistVideo.updateMany({
      where: { downloadStatus: 'downloading' },
      data: { downloadStatus: 'pending' },
    }),
  ]);
  if (playlists.count > 0 || videos.count > 0) {
    console.log(
      `[sync] Reset ${playlists.count} stuck playlist(s) and ${videos.count} stuck video(s)`
    );
  }
}

// Fetches the current video list from YouTube and reconciles it against the
// DB: marks videos no longer in the playlist as removed, inserts brand-new
// ones as `pending`, and refreshes the playlist's own title/thumbnail/count.
// Shared by the regular sync flow and the admin-triggered soft reimport —
// but NOT identical reconciliation: `skipRemoval` (used by soft reimport,
// see reimport.ts) skips the "mark missing videos removed" step, which is
// the one destructive part of this function — it clears mediaFileId and
// GC-deletes the shared file. Soft reimport's whole premise is "existing
// files are reused as-is," so it must never reach that step; adding
// newly-appeared videos and refreshing playlist metadata are both
// non-destructive and stay unconditional either way.
export async function refreshPlaylistFromYoutube(
  playlistId: string,
  options: { skipRemoval?: boolean } = {}
): Promise<{ addedCount: number; removedCount: number }> {
  let addedCount = 0;
  let removedCount = 0;

  const playlist = await prisma.playlist.findUniqueOrThrow({
    where: { id: playlistId },
    select: { id: true, youtubeId: true },
  });
  if (!playlist.youtubeId) {
    // Generated playlists have no real YouTube counterpart to refresh from —
    // this should never actually be reachable for one (Actions.tsx hides the
    // Sync button for them), but fail loudly rather than silently building a
    // broken fetch URL if it ever is.
    throw new Error(`Playlist ${playlistId} has no youtubeId — cannot sync a generated playlist`);
  }

  // ── 1. Fetch current video list ────────────────────────────────────────────
  const info = await fetchPlaylist(
    `https://www.youtube.com/playlist?list=${playlist.youtubeId}`
  );
  const freshIds = new Set(info.videos.map((v) => v.id));

  // ── 2. Current DB videos (non-removed) ────────────────────────────────────
  const dbVideos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: { not: 'removed' } },
    select: { id: true, youtubeId: true, mediaFileId: true, missingSince: true },
  });
  const dbIds = new Set(dbVideos.map((v) => v.youtubeId));

  if (!options.skipRemoval) {
    // Safety net beyond fetchPlaylist's own playlist_count cross-check —
    // that one can only catch a truncated fetch if yt-dlp's output actually
    // carries playlist_count; this one catches it either way, by comparing
    // against what we already had. Was a 50%-of-playlist threshold until a
    // real incident: a large playlist's fetch got quietly truncated (bot-
    // protection or some other partial failure) by an amount under 50% but
    // still in the hundreds of videos, so this passed it as "plausible" —
    // wrongly marking hundreds of already-downloaded videos removed
    // (clearing mediaFileId and GC-deleting their files) for videos that
    // were never actually removed from the real YouTube playlist, forcing a
    // full redownload. 10% mirrors fetchPlaylist's own threshold so both
    // layers agree on what's plausible. This guards the catastrophic case;
    // it does nothing for a single video (or a few) dropping out of one
    // otherwise-normal fetch, which is what the missingSince grace period
    // right below handles instead.
    const droppedCount = dbVideos.filter((v) => !freshIds.has(v.youtubeId)).length;
    if (dbVideos.length >= 20 && droppedCount > Math.max(5, dbVideos.length * 0.1)) {
      throw new Error(
        `Refusing to sync playlist ${playlistId}: fetch returned ${info.videos.length} videos vs ${dbVideos.length} ` +
        `already known (would remove ${droppedCount}) — this looks like a partial/failed fetch, not a real change.`
      );
    }

    // ── 3. Remove videos no longer in the playlist ──────────────────────────
    // Only once a video has been missing across two consecutive real syncs
    // in a row, not the first time it doesn't show up — a single yt-dlp
    // scrape undercounting by a handful of videos happens on its own, well
    // under the mass-truncation threshold above, and used to be enough on
    // its own to GC a video's shared file and force every offline-synced
    // phone to fully redownload it once it reappeared, even though nothing
    // about the video itself ever changed (see missingSince in schema.prisma).
    for (const dbVideo of dbVideos) {
      const stillMissing = !freshIds.has(dbVideo.youtubeId);

      if (stillMissing && dbVideo.missingSince === null) {
        // First miss — flag it and wait for the next real sync to confirm
        // before doing anything destructive.
        await prisma.playlistVideo.update({
          where: { id: dbVideo.id },
          data: { missingSince: new Date() },
        });
      } else if (stillMissing) {
        // Missing two syncs running — treat as genuinely removed.
        await prisma.playlistVideo.update({
          where: { id: dbVideo.id },
          data: { downloadStatus: 'removed', mediaFileId: null, fileSize: null, bitrate: null, missingSince: null },
        });
        removedCount++;
        // Break this row's reference before trying to GC the shared file —
        // it only actually deletes once no other playlist_video points at it.
        if (dbVideo.mediaFileId) {
          await tryDeleteMediaFile(dbVideo.mediaFileId);
        }
      } else if (dbVideo.missingSince !== null) {
        // Was flagged from a past sync but has reappeared — clear the flag
        // rather than let a stale grace period linger.
        await prisma.playlistVideo.update({
          where: { id: dbVideo.id },
          data: { missingSince: null },
        });
      }
    }
  }

  // ── 3b. Restore any previously-removed video that's reappeared ───────────
  // A video wrongly marked removed by a past bad sync (or genuinely re-added
  // to the YouTube playlist) would otherwise stay stuck as "removed"
  // forever — the queries above only ever look at non-removed rows, and
  // step 4's createMany silently no-ops on it below (a row with this
  // playlistId+youtubeId already exists). Its media file is already gone by
  // this point, so this just clears the way for a fresh download.
  const removedVideos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: 'removed' },
    select: { id: true, youtubeId: true },
  });
  for (const removedVideo of removedVideos) {
    const fresh = info.videos.find((v) => v.id === removedVideo.youtubeId);
    if (!fresh) continue;
    await prisma.playlistVideo.update({
      where: { id: removedVideo.id },
      data: { downloadStatus: 'pending', downloadError: null, position: fresh.position, isAvailable: true },
    });
    addedCount++;
  }

  // ── 4. Add new videos ─────────────────────────────────────────────────────
  const newVideos = info.videos.filter((v) => !dbIds.has(v.id));
  addedCount += newVideos.length;
  if (newVideos.length > 0) {
    await prisma.playlistVideo.createMany({
      data: newVideos.map((v) => ({
        playlistId,
        youtubeId: v.id,
        title: v.title,
        originalTitle: v.title,
        duration: v.duration,
        thumbnailUrl: v.thumbnailUrl,
        position: v.position,
        isAvailable: v.isAvailable,
        channelName: v.channelName,
        downloadStatus: 'pending',
      })),
      skipDuplicates: true,
    });
  }

  // ── 5. Update playlist metadata ───────────────────────────────────────────
  // videoCount is recomputed from actual rows rather than trusted directly
  // from info.videos.length — this is the only place that ever writes it, so
  // a partial createMany failure above (e.g. a race between two overlapping
  // sync attempts, such as an old process not fully shut down yet during a
  // redeploy racing the freshly-started one) would otherwise leave it
  // permanently drifted from what's actually in the database, with nothing
  // to ever correct it.
  const actualVideoCount = await prisma.playlistVideo.count({
    where: { playlistId, downloadStatus: { not: 'removed' } },
  });
  await prisma.playlist.update({
    where: { id: playlistId },
    data: { title: info.title, thumbnailUrl: info.thumbnailUrl, videoCount: actualVideoCount },
  });

  return { addedCount, removedCount };
}

// Exported (not just used internally) so the admin soft-reimport and
// playlist-generation flows can await the same download-then-metadata pass
// directly, instead of going through the fire-and-forget
// startBackgroundDownload wrapper meant for HTTP handlers that can't block.
// `rescanAll` is threaded straight through to resolvePlaylistQuality below —
// see that function's own doc comment (slskdQualityWorker.ts) for what it
// changes; only scanForHqUpgrades sets it.
//
// `report` is how syncPlaylist/retryFailedVideos/scanForHqUpgrades opt into
// a SyncReport for this run (see finalizeSyncReport) — omitted entirely by
// callers that don't want one (soft reimport, playlist generation, and the
// pause/resume continuation in startBackgroundDownload, none of which map
// onto a single well-defined SyncActionType). `priorFailedIds` lets
// retryFailedVideos tell "recovered from a past failure" apart from
// "downloaded for the first time" in the stats below, since both look
// identical from inside this loop (downloadStatus: 'pending' either way).
export async function downloadPendingVideos(
  playlistId: string,
  options: {
    rescanAll?: boolean;
    // Threaded straight through to resolvePlaylistQuality's own option of
    // the same name — see there for what it changes. Only scanForHqUpgrades
    // ever sets it, from the "Scan for HQ" modal's toggle.
    ignoreDuration?: boolean;
    report?: { actionType: SyncActionType; startedAt: number; stats: SyncStats; priorFailedIds?: Set<string> };
  } = {}
): Promise<void> {
  const { rescanAll = false, ignoreDuration = false, report } = options;
  try {
    // Based on how many videos this pass is actually about to attempt, not
    // the playlist's total size — a retry-failed pass on a huge playlist
    // might only be retrying a handful of videos, which shouldn't trigger
    // "large batch" pacing just because the playlist itself is large.
    const pendingCount = await prisma.playlistVideo.count({
      where: { playlistId, downloadStatus: 'pending', isAvailable: true },
    });
    const baselineDelayMs = pendingCount > LARGE_BATCH_THRESHOLD
      ? LARGE_BATCH_BASELINE_DELAY_MS
      : 0;

    // Pacing state — local to this one sync pass, not persisted across
    // separate sync/retry runs. tierIndex 0 is the baseline above; 1 and 2
    // index into PACING_ESCALATION_MS.
    let tierIndex = 0;
    let consecutiveFailures = 0;
    let consecutiveSuccesses = 0;
    const delayForCurrentTier = () => (tierIndex === 0 ? baselineDelayMs : PACING_ESCALATION_MS[tierIndex - 1]);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = await prisma.playlist.findUnique({
        where: { id: playlistId },
        select: { syncPaused: true },
      });
      if (!current || current.syncPaused) break;

      const video = await prisma.playlistVideo.findFirst({
        where: { playlistId, downloadStatus: 'pending', isAvailable: true },
        orderBy: { position: 'asc' },
      });
      if (!video) break;

      // Only pace actual network fetches — a video whose file is already in
      // the shared store (deduped by youtubeId across every playlist/user)
      // resolves from disk with no request to YouTube at all, so there's
      // nothing to protect against here and no reason to sit through a
      // multi-minute backoff for it.
      const alreadyCached = await prisma.mediaFile.findUnique({ where: { youtubeId: video.youtubeId } });
      if (!alreadyCached && delayForCurrentTier() > 0) {
        pacingPlaylists.add(playlistId);
        await sleep(delayForCurrentTier());
        pacingPlaylists.delete(playlistId);

        // Re-check pause after the wait — otherwise a pause clicked mid-sleep
        // would still be followed by one more full download attempt, on top
        // of whatever pacing delay it just sat through.
        const afterSleep = await prisma.playlist.findUnique({
          where: { id: playlistId },
          select: { syncPaused: true },
        });
        if (!afterSleep || afterSleep.syncPaused) break;
      }

      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: { downloadStatus: 'downloading' },
      });

      try {
        const mediaFile = await resolveMediaFile(video.youtubeId);
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: {
            downloadStatus: 'done',
            mediaFileId: mediaFile.id,
            fileSize: mediaFile.fileSize,
            bitrate: mediaFile.bitrate,
            downloadError: null,
          },
        });
        console.log(`[sync] ✓ ${video.youtubeId} — ${video.title.slice(0, 60)}`);
        if (report) {
          if (report.priorFailedIds?.has(video.id)) report.stats.recoveredCount++;
          else report.stats.downloadedCount++;
        }

        consecutiveFailures = 0;
        consecutiveSuccesses++;
        if (consecutiveSuccesses >= SUCCESS_STREAK_TO_STEP_DOWN && tierIndex > 0) {
          tierIndex--;
          consecutiveSuccesses = 0;
          console.log(`[sync] Pacing eased to tier ${tierIndex} (${delayForCurrentTier() / 1000}s between downloads) for playlist ${playlistId}`);
        }
      } catch (err) {
        const message = (err as Error).message;
        console.error(`[sync] ✗ ${video.youtubeId}:`, message);
        if (report) {
          report.stats.failedCount++;
          const reason = categorizeFailure(message);
          report.stats.failureReasons[reason] = (report.stats.failureReasons[reason] ?? 0) + 1;
          if (report.stats.failures.length < MAX_FAILURE_DETAILS) {
            // Same 500-char truncation as the downloadError column this
            // mirrors (see the playlistVideo.update calls below) — plenty
            // for a human to actually read the cause, short of storing
            // yt-dlp's full (sometimes very long) stderr verbatim.
            report.stats.failures.push({ title: video.title, reason, message: message.slice(0, 500) });
          }
        }
        const permanentlyUnavailable = isAgeRestricted(message) || isSignInRequired(message) || isPermanentlyUnavailable(message);

        if (permanentlyUnavailable) {
          // isAvailable: false (never removePlaylistVideo) — the video is
          // still physically present in the real YouTube playlist, just
          // permanently undownloadable, so a hard delete would only get
          // resurrected as "new" by the next refreshPlaylistFromYoutube
          // pass (see that function's step 4), retried, and fail again:
          // an infinite loop across sync passes rather than a one-time
          // failure. isAvailable: false is the stable, resync-proof way to
          // give up on a video that isn't actually gone from the source.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { downloadStatus: 'failed', downloadError: message.slice(0, 500), isAvailable: false },
          });
        } else {
          const attempts = video.downloadAttempts + 1;
          if (attempts >= MAX_DOWNLOAD_ATTEMPTS) {
            // Same resurrection risk as above applies here — this failure
            // mode isn't recognized as permanent, but 3 failed attempts is
            // itself evidence it'll never succeed, so give up the same way.
            console.error(`[sync] Giving up on ${video.youtubeId} after ${attempts} failed attempts — hiding from playlist ${playlistId}`);
            await prisma.playlistVideo.update({
              where: { id: video.id },
              data: { downloadStatus: 'failed', downloadError: message.slice(0, 500), downloadAttempts: attempts, isAvailable: false },
            });
          } else {
            await prisma.playlistVideo.update({
              where: { id: video.id },
              data: { downloadStatus: 'failed', downloadError: message.slice(0, 500), downloadAttempts: attempts },
            });
          }
        }

        consecutiveSuccesses = 0;
        // Age-restriction, sign-in-required, and permanent-unavailability
        // are routine, video-specific failures unrelated to IP health —
        // none of them should count towards a "we're being throttled"
        // streak at all.
        if (!permanentlyUnavailable) {
          consecutiveFailures++;
          const shouldEscalate = isLikelyRateLimited(message) || consecutiveFailures >= FAILURE_STREAK_TO_ESCALATE;
          if (shouldEscalate && tierIndex < PACING_ESCALATION_MS.length) {
            tierIndex++;
            consecutiveFailures = 0;
            console.log(`[sync] Pacing escalated to tier ${tierIndex} (${delayForCurrentTier() / 1000}s between downloads) for playlist ${playlistId}`);
          }
        }
      }
    }

    // Downloads are done — resolve metadata for whatever's still pending in
    // this playlist as the last step of the same sync pass, then (now that
    // artists are resolved) check slskd for a better-quality mp3 of each.
    // Both phases report per-video progress via syncPhases (see SyncPhase
    // above) — otherwise the frontend's progress bar just sits at 100% with
    // no way to tell "still genuinely working through metadata/HQ checks"
    // from "stuck", for however long these take (an HQ check with the
    // auto-download toggle on does real slskd searches and file transfers,
    // which visibly can take a while).
    // Reset per phase (not shared/accumulated across metadata → quality) —
    // each is its own pass over its own candidate set, so "processed so far"
    // starts fresh when quality picks up where metadata left off. The same
    // array reference is reused across every callback within one phase (and
    // read directly by getSyncPhase between syncPhases.set calls, not just
    // at them), so a push below is visible to a poll immediately.
    const metadataProcessedIds: string[] = [];
    await resolvePlaylistMetadata(playlistId, {
      onProgress: (current, total, title) => syncPhases.set(playlistId, {
        phase: 'metadata', current, total, title, processedIds: metadataProcessedIds, hqFoundIds: [],
      }),
      onVideoProcessed: (videoId) => metadataProcessedIds.push(videoId),
    });
    const qualityProcessedIds: string[] = [];
    const qualityHqFoundIds: string[] = [];
    await resolvePlaylistQuality(playlistId, {
      onProgress: (current, total, title) => syncPhases.set(playlistId, {
        phase: 'quality', current, total, title, processedIds: qualityProcessedIds, hqFoundIds: qualityHqFoundIds,
      }),
      onVideoProcessed: (videoId) => qualityProcessedIds.push(videoId),
      onHqFound: (videoId) => {
        qualityHqFoundIds.push(videoId);
        if (report) report.stats.newHqCount++;
      },
      rescanAll,
      ignoreDuration,
    });

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { syncStatus: 'idle', lastSyncedAt: new Date() },
    });
  } catch (err) {
    console.error(`[sync] Fatal error for playlist ${playlistId}:`, err);
    await prisma.playlist
      .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
      .catch(() => {});
  } finally {
    // Defensive — the flag is already cleared right after every sleep, but
    // this guarantees it never gets stuck on if some future change throws
    // between the two.
    pacingPlaylists.delete(playlistId);
    syncPhases.delete(playlistId);

    // Always written once the run is over, whether it finished cleanly or
    // hit the catch above — a report with a nonzero failedCount is still
    // exactly what the stats modal is for.
    if (report) {
      await finalizeSyncReport({ playlistId, actionType: report.actionType, startedAt: report.startedAt, stats: report.stats });
    }
  }
}

export function startBackgroundDownload(playlistId: string): void {
  if (activeSyncs.has(playlistId)) return;
  activeSyncs.add(playlistId);
  downloadPendingVideos(playlistId).finally(() => activeSyncs.delete(playlistId));
}

export async function syncPlaylist(playlistId: string): Promise<void> {
  if (activeSyncs.has(playlistId)) {
    console.log(`[sync] ${playlistId} already syncing — skipped`);
    return;
  }
  activeSyncs.add(playlistId);

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true },
  });
  if (!playlist) {
    activeSyncs.delete(playlistId);
    return;
  }

  await prisma.playlist.update({
    where: { id: playlistId },
    data: { syncStatus: 'syncing' },
  });

  const startedAt = Date.now();
  const stats = createSyncStats();
  try {
    const { addedCount, removedCount } = await refreshPlaylistFromYoutube(playlistId);
    stats.addedCount = addedCount;
    stats.removedCount = removedCount;
    await downloadPendingVideos(playlistId, { report: { actionType: 'sync', startedAt, stats } });
    // downloadPendingVideos sets syncStatus → idle / error, and (since
    // `report` was passed) writes the SyncReport itself once it's done —
    // even if refreshPlaylistFromYoutube's own added/removed counts are all
    // this run ends up reporting.

  } catch (err) {
    console.error(`[sync] Error syncing playlist ${playlistId}:`, err);
    await prisma.playlist
      .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
      .catch(() => {});
    // refreshPlaylistFromYoutube itself failed (e.g. the fetchPlaylist call)
    // before downloadPendingVideos — and its `report` — ever got a chance
    // to run, so this is the one path where a report has to be written here
    // instead of there.
    await finalizeSyncReport({ playlistId, actionType: 'sync', startedAt, stats });
  } finally {
    activeSyncs.delete(playlistId);
  }
}

// Uses the distinct 'retrying' syncStatus (rather than 'syncing') so the
// frontend can tell this apart from a regular sync — retrying failed videos
// only drains what's already pending, it never re-fetches from YouTube, so
// unlike a regular sync it must never be pausable/resumable (see the /pause
// route guard in routes/youtube.ts): pausing mid-retry and then resuming
// would resume as a bare download-pending-videos pass, silently dropping the
// "retry" intent with no way to tell from the UI that it happened.
export function retryFailedVideos(playlistId: string): void {
  if (activeSyncs.has(playlistId)) return;
  activeSyncs.add(playlistId);

  (async () => {
    const startedAt = Date.now();
    const stats = createSyncStats();
    try {
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { syncStatus: 'retrying' },
      });
      const failedVideos = await prisma.playlistVideo.findMany({
        where: { playlistId, downloadStatus: 'failed', isAvailable: true },
        select: { id: true },
      });
      const priorFailedIds = new Set(failedVideos.map((v) => v.id));
      await prisma.playlistVideo.updateMany({
        where: { playlistId, downloadStatus: 'failed', isAvailable: true },
        data: { downloadStatus: 'pending', downloadError: null },
      });
      await downloadPendingVideos(playlistId, { report: { actionType: 'retry_failed', startedAt, stats, priorFailedIds } });
      // downloadPendingVideos sets syncStatus → idle / error and writes the
      // SyncReport itself (see `report` above).
    } catch (err) {
      console.error(`[sync] Error retrying failed videos for playlist ${playlistId}:`, err);
      await prisma.playlist
        .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
        .catch(() => {});
      await finalizeSyncReport({ playlistId, actionType: 'retry_failed', startedAt, stats });
    } finally {
      activeSyncs.delete(playlistId);
    }
  })();
}

// Re-runs metadata resolution + HQ quality-checking for whatever's already
// downloaded, without touching YouTube at all — goes straight to
// downloadPendingVideos rather than through refreshPlaylistFromYoutube.
// This is the only way to retry a failed/skipped HQ download for a
// generated playlist: it has no youtubeId for refreshPlaylistFromYoutube to
// fetch from, and generated playlists deliberately have no Sync button at
// all (see Actions.tsx) — so without this, a video whose HQ download failed
// once (qualityCheckStatus stays 'pending' on failure — see
// resolvePlaylistQuality) would stay stuck that way forever. Works the same
// for a regular playlist too, as a
// lighter-weight alternative to a full Sync when all you want is to
// recheck slskd for upgrades.
//
// Passes rescanAll: true — unlike a regular sync's automatic quality check
// (incremental, newly-downloaded videos only), this is a deliberate,
// user-initiated "check again" action, so it re-searches every video that
// doesn't already have a real HQ file on disk, even ones a past check found
// nothing for. slskd's peer pool changes throughout the day, so a track
// with no match last time isn't a permanent verdict the way "we already
// downloaded the upgrade" is.
//
// Uses the regular 'syncing' status (not a distinct one) since it's still a
// genuine download-pending-videos pass, just one that happens to find
// nothing pending to download most of the time — the frontend's syncPhase
// reporting already makes the metadata/quality-check work visible
// regardless.
// ignoreDuration: from the "Scan for HQ" modal's toggle — see
// downloadPendingVideos/resolvePlaylistQuality's own options of the same
// name for what it does.
export function scanForHqUpgrades(playlistId: string, options: { ignoreDuration?: boolean } = {}): void {
  if (activeSyncs.has(playlistId)) return;
  activeSyncs.add(playlistId);
  const { ignoreDuration = false } = options;

  (async () => {
    const startedAt = Date.now();
    const stats = createSyncStats();
    try {
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { syncStatus: 'syncing' },
      });
      await downloadPendingVideos(playlistId, {
        rescanAll: true,
        ignoreDuration,
        report: { actionType: 'scan_hq', startedAt, stats },
      });
      // downloadPendingVideos sets syncStatus → idle / error and writes the
      // SyncReport itself (see `report` above).
    } catch (err) {
      console.error(`[sync] Error scanning for HQ upgrades for playlist ${playlistId}:`, err);
      await prisma.playlist
        .update({ where: { id: playlistId }, data: { syncStatus: 'error' } })
        .catch(() => {});
      await finalizeSyncReport({ playlistId, actionType: 'scan_hq', startedAt, stats });
    } finally {
      activeSyncs.delete(playlistId);
    }
  })();
}

export async function setSyncPaused(playlistId: string, paused: boolean) {
  return prisma.playlist.update({
    where: { id: playlistId },
    data: { syncPaused: paused },
  });
}

export async function cleanupMediaFiles(mediaFileIds: string[]): Promise<void> {
  for (const id of mediaFileIds) {
    await tryDeleteMediaFile(id);
  }
}

// Deletes a single playlist_video row outright (not the soft "removed"
// status a real resync uses), keeping playlist.videoCount and the shared
// media file store consistent. Used for cases where the row isn't worth
// keeping around anymore: the audio-analysis dedup check for generated
// playlists (see audioAnalysisWorker.ts), a generated playlist's failed
// downloads after its initial build (see playlistGenerator.ts — a generated
// playlist never gets a normal resync to retry/clean those up otherwise),
// and a regular playlist's video that's exhausted MAX_DOWNLOAD_ATTEMPTS in
// downloadPendingVideos above.
export async function removePlaylistVideo(playlistVideoId: string, mediaFileId: string | null): Promise<void> {
  const video = await prisma.playlistVideo.delete({ where: { id: playlistVideoId } });
  await prisma.playlist.update({
    where: { id: video.playlistId },
    data: { videoCount: { decrement: 1 } },
  });
  if (mediaFileId) {
    await tryDeleteMediaFile(mediaFileId);
  }
}

// Soft-removes a single video the same way refreshPlaylistFromYoutube does
// when a video disappears from the real YouTube playlist (step 3 above) —
// the row stays around (hidden everywhere via downloadStatus: 'removed')
// rather than being hard-deleted, so it can't get resurrected as "new" by a
// later sync the way a hard delete could. Unlike that step, this runs
// outside of a resync pass, so it decrements videoCount itself instead of
// relying on refreshPlaylistFromYoutube's end-of-sync recount. Used by the
// per-user "auto-delete non-music" preference (audioAnalysisWorker.ts and
// removeExistingNonMusicVideos below).
export async function markVideoRemoved(playlistVideoId: string, playlistId: string, mediaFileId: string | null): Promise<void> {
  await prisma.playlistVideo.update({
    where: { id: playlistVideoId },
    data: { downloadStatus: 'removed', mediaFileId: null, fileSize: null, bitrate: null },
  });
  await prisma.playlist.update({
    where: { id: playlistId },
    data: { videoCount: { decrement: 1 } },
  });
  if (mediaFileId) {
    await tryDeleteMediaFile(mediaFileId);
  }
}

// One-time sweep run when a user flips "auto-delete non-music" from off to
// on (see PATCH /api/auth/settings/auto-delete-non-music) — without this,
// tracks already tagged with an auto-delete genre before the toggle was
// enabled would sit in the library forever, since the per-track check in
// audioAnalysisWorker.ts only ever fires once, at analysis time. Same
// genre set/matching as that check, so this matches exactly what a user
// filtering by genres=non-music,audiobook,noise would see.
export async function removeExistingNonMusicVideos(userId: string): Promise<void> {
  const videos = await prisma.playlistVideo.findMany({
    where: { playlist: { userId }, isAvailable: true, downloadStatus: { not: 'removed' } },
    select: { id: true, playlistId: true, mediaFileId: true, genres: true },
  });

  for (const video of videos) {
    if (matchingAutoDeleteGenre(video.genres)) {
      await markVideoRemoved(video.id, video.playlistId, video.mediaFileId);
    }
  }
}

// Permanently deletes a track's shared file and hides every playlist_video
// row — across every playlist, any user's — that references this youtubeId.
// resolveMediaFile dedupes by youtubeId globally (see its own comment), so
// the physical file backing this track is the same one every other
// playlist's copy of the same video plays from; once it's gone from disk,
// every one of those rows would otherwise be left pointing at a MediaFile
// that no longer resolves, so all of them have to be hidden here too, not
// just the single row the caller's request was about.
//
// downloadStatus: 'deleted' (a value distinct from 'removed') is
// deliberate: refreshPlaylistFromYoutube's step 3b revives any 'removed' row
// back to 'pending' the moment YouTube's scrape shows the video is still
// really there — exactly the resurrection this needs to avoid, since the
// video is still legitimately sitting in the user's real YouTube playlist,
// only the local copy is gone. isAvailable: false on top is the same
// resync-proof "give up without ever being retried" signal
// downloadPendingVideos already uses for a permanently-unavailable video
// (see its own comment) — every query that lists/counts visible videos
// (dashboard, /videos, playlistStats) already treats isAvailable: false as
// hidden, so this reuses that existing mechanism rather than inventing a
// second one.
export async function deleteTrackEverywhere(youtubeId: string): Promise<void> {
  await prisma.playlistVideo.updateMany({
    where: { youtubeId },
    data: { downloadStatus: 'deleted', isAvailable: false, mediaFileId: null, fileSize: null, bitrate: null },
  });

  // Only resolvable now that every row above has been detached from it —
  // tryDeleteMediaFile no-ops on a still-referenced row (see its own
  // comment), which before the updateMany above would have been every row
  // sharing this youtubeId.
  const mediaFile = await prisma.mediaFile.findUnique({ where: { youtubeId } });
  if (mediaFile) {
    await tryDeleteMediaFile(mediaFile.id);
  }
}

/** Distinct MediaFile ids currently used by a playlist's downloaded videos — snapshot before deleting the playlist. */
export async function mediaFilesUsedBy(playlistId: string): Promise<string[]> {
  const videos = await prisma.playlistVideo.findMany({
    where: { playlistId, downloadStatus: 'done', mediaFileId: { not: null } },
    select: { mediaFileId: true },
  });
  return [...new Set(videos.map((v) => v.mediaFileId!))];
}
