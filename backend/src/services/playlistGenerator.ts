import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { isLastfmDiscoverEnabled } from './settings';
import { getSimilarTracks } from './lastfm';
import { searchTopMatches, searchRemixes, isRemixTitle, stripRemixQualifier, RemixResult } from './youtube';
import { parseArtistAndTitle } from './musicbrainz';
import { tryClaimSync, releaseSyncClaim, downloadPendingVideos, removePlaylistVideo } from './syncService';
import { createLog } from './auditLog';

const CANDIDATES_PER_TIER = 10;
const CONCURRENCY = 4;

interface SourceVideo {
  youtubeId: string;
  title: string;
  originalTitle: string | null;
  channelName: string | null;
  artist: string | null;
  position: number;
}

interface Candidate {
  youtubeId: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  sourcePosition: number;
}

// Combines artist+title into a single comparable key for "is this the same
// song" checks — used both to seed exclusions from the source playlist and
// to dedup across whatever's already been accepted into the generated one.
function normalizeSongKey(artist: string | null, title: string): string {
  return `${artist ?? ''} ${title}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Walks a batch of already-fetched YouTube search results (no further awaits
// inside this loop) and returns the first one that isn't already used by
// video ID or by normalized song identity. Synchronous end-to-end, so
// callers can safely commit the pick immediately after — see the race-safety
// note on the Last.fm tier below for why that matters under concurrency.
function pickFromResults(
  results: RemixResult[],
  excludeIds: Set<string>,
  seenKeys: Set<string>,
): { candidate: Candidate; key: string } | null {
  for (const r of results) {
    if (excludeIds.has(r.id)) continue;
    const { artist, title } = parseArtistAndTitle(r.title, r.channelName);
    const key = normalizeSongKey(artist, title);
    if (seenKeys.has(key)) continue;
    return {
      candidate: {
        youtubeId: r.id, title: r.title, channelName: r.channelName,
        thumbnailUrl: r.thumbnailUrl, duration: r.duration, sourcePosition: -1,
      },
      key,
    };
  }
  return null;
}

async function findAlternative(
  video: SourceVideo,
  excludeIds: Set<string>,
  seenKeys: Set<string>,
  lastfmEnabled: boolean,
): Promise<Candidate | null> {
  const parsed = parseArtistAndTitle(video.originalTitle ?? video.title, video.channelName);
  const artist = video.artist ?? parsed.artist;
  const title = video.artist ? video.title : parsed.title;

  // Tier 1: Last.fm similar tracks, top 10, in the match-score order Last.fm
  // already returns them in.
  if (lastfmEnabled && artist && title) {
    const similar = await getSimilarTracks(artist, title, CANDIDATES_PER_TIER);
    for (const s of similar) {
      const key = normalizeSongKey(s.artist, s.title);
      if (seenKeys.has(key)) continue;

      const [match] = await searchTopMatches(`${s.artist} ${s.title}`, 1);
      if (!match) continue;

      // Multiple workers run concurrently (see discoverCandidates), each
      // awaiting network calls above. Re-checking both sets synchronously
      // right here, immediately before committing, closes the race window —
      // nothing else can run between this check and the two .add() calls
      // since there's no await between them (Node is single-threaded).
      if (excludeIds.has(match.id) || seenKeys.has(key)) continue;
      excludeIds.add(match.id);
      seenKeys.add(key);
      return {
        youtubeId: match.id, title: `${s.artist} - ${s.title}`, channelName: match.channelName,
        thumbnailUrl: match.thumbnailUrl, duration: match.duration, sourcePosition: video.position,
      };
    }
  }

  // Tier 2: remix / original fallback.
  const query = [artist, title].filter(Boolean).join(' ') || video.title;
  const isRemix = isRemixTitle(title || video.title);

  if (isRemix) {
    const originalQuery = stripRemixQualifier(query);
    if (originalQuery && originalQuery !== query) {
      const originalMatches = await searchTopMatches(originalQuery, CANDIDATES_PER_TIER);
      const picked = pickFromResults(originalMatches, excludeIds, seenKeys);
      if (picked) {
        excludeIds.add(picked.candidate.youtubeId);
        seenKeys.add(picked.key);
        return { ...picked.candidate, sourcePosition: video.position };
      }
    }
  }

  const remixes = await searchRemixes(query, new Set([video.youtubeId, ...excludeIds]), CANDIDATES_PER_TIER);
  const picked = pickFromResults(remixes, excludeIds, seenKeys);
  if (picked) {
    excludeIds.add(picked.candidate.youtubeId);
    seenKeys.add(picked.key);
    return { ...picked.candidate, sourcePosition: video.position };
  }

  return null;
}

// Finds one alternative per source-playlist track (Last.fm similar track,
// falling back to a remix/original search), running several lookups
// concurrently. Returns fewer entries than the source playlist whenever no
// good alternative exists for a track — expected and fine, not an error.
export async function discoverCandidates(sourcePlaylistId: string): Promise<Candidate[]> {
  const sourceVideos: SourceVideo[] = await prisma.playlistVideo.findMany({
    where: { playlistId: sourcePlaylistId, downloadStatus: { not: 'removed' } },
    orderBy: { position: 'asc' },
    select: { youtubeId: true, title: true, originalTitle: true, channelName: true, artist: true, position: true },
  });

  const excludeIds = new Set(sourceVideos.map(v => v.youtubeId));
  const seenKeys = new Set(sourceVideos.map(v => normalizeSongKey(v.artist, v.title)));
  const lastfmEnabled = isLastfmDiscoverEnabled() && isOnline();

  const results: Candidate[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = cursor++;
      if (index >= sourceVideos.length) return;
      const candidate = await findAlternative(sourceVideos[index], excludeIds, seenKeys, lastfmEnabled);
      if (candidate) results.push(candidate);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Workers finish out of order — sort back to the source playlist's own
  // track order so the generated playlist's pacing/flow mirrors it.
  return results.sort((a, b) => a.sourcePosition - b.sourcePosition);
}

export interface StartGenerateResult {
  started: boolean;
  error?: string;
  playlistId?: string;
}

export async function startGeneratePlaylist(sourcePlaylistId: string, userId: string): Promise<StartGenerateResult> {
  const source = await prisma.playlist.findFirst({ where: { id: sourcePlaylistId, userId } });
  if (!source) return { started: false, error: 'Playlist not found' };
  if (source.sourcePlaylistId) return { started: false, error: 'Cannot generate a similar playlist from a generated one' };
  if (source.syncStatus !== 'idle') return { started: false, error: 'The source playlist must finish syncing first' };
  if (!isOnline()) return { started: false, error: 'This service is offline' };
  if (!isLastfmDiscoverEnabled()) return { started: false, error: 'Last.fm is not configured' };

  const existing = await prisma.playlist.findUnique({ where: { sourcePlaylistId } });
  if (existing) return { started: false, error: 'A similar playlist has already been generated for this one' };

  const newPlaylist = await prisma.playlist.create({
    data: {
      userId,
      youtubeId: null,
      title: `${source.customName ?? source.title} (YoutubeVault Remix)`,
      thumbnailUrl: source.thumbnailUrl,
      sourcePlaylistId: source.id,
      sourcePlaylistName: source.customName ?? source.title,
      syncStatus: 'generating',
    },
  });

  runGeneration(newPlaylist.id, sourcePlaylistId).catch((err) => {
    console.error(`[generate] Fatal error generating playlist from ${sourcePlaylistId}:`, err);
  });

  return { started: true, playlistId: newPlaylist.id };
}

async function logGenerationResult(newPlaylistId: string, failedCount: number): Promise<void> {
  try {
    const playlist = await prisma.playlist.findUnique({ where: { id: newPlaylistId } });
    if (!playlist) return;
    await createLog({
      userId: playlist.userId,
      action: 'generated_playlist_created',
      playlistId: playlist.id,
      details: {
        name: playlist.customName ?? playlist.title,
        sourceName: playlist.sourcePlaylistName,
        songCount: playlist.videoCount,
        failedCount,
        status: playlist.syncStatus,
      },
    });
  } catch (err) {
    console.error(`[generate] Failed to log generation result for ${newPlaylistId}:`, err);
  }
}

async function runGeneration(newPlaylistId: string, sourcePlaylistId: string): Promise<void> {
  try {
    const candidates = await discoverCandidates(sourcePlaylistId);

    if (candidates.length > 0) {
      await prisma.playlistVideo.createMany({
        data: candidates.map((c, idx) => ({
          playlistId: newPlaylistId,
          youtubeId: c.youtubeId,
          title: c.title,
          originalTitle: c.title,
          duration: c.duration,
          thumbnailUrl: c.thumbnailUrl,
          position: idx + 1,
          isAvailable: true,
          channelName: c.channelName,
          downloadStatus: 'pending',
        })),
        skipDuplicates: true,
      });
    }

    await prisma.playlist.update({
      where: { id: newPlaylistId },
      data: { videoCount: candidates.length, syncStatus: 'syncing' },
    });

    if (!tryClaimSync(newPlaylistId)) return; // shouldn't happen — defensive only
    let failedCount = 0;
    try {
      await downloadPendingVideos(newPlaylistId);
      // downloadPendingVideos resolves metadata and sets syncStatus → idle/error

      // A failed candidate isn't something the user deliberately chose to
      // keep retrying — a generated playlist never gets a normal resync to
      // clean these up otherwise, so just drop them rather than leaving
      // permanently-stuck "failed" entries behind.
      const failedVideos = await prisma.playlistVideo.findMany({
        where: { playlistId: newPlaylistId, downloadStatus: 'failed' },
        select: { id: true, mediaFileId: true },
      });
      failedCount = failedVideos.length;
      for (const video of failedVideos) {
        await removePlaylistVideo(video.id, video.mediaFileId);
      }
    } finally {
      releaseSyncClaim(newPlaylistId);
    }
    await logGenerationResult(newPlaylistId, failedCount);
  } catch (err) {
    console.error(`[generate] Error generating playlist ${newPlaylistId}:`, err);
    await prisma.playlist.update({ where: { id: newPlaylistId }, data: { syncStatus: 'error' } }).catch(() => {});
    await logGenerationResult(newPlaylistId, 0);
  }
}
