import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { parseVideoId, fetchVideoMetadata, searchTopMatches } from './youtube';
import { parseArtistAndTitle } from './musicbrainz';
import { splitArtistTitle, MATCH_TIERS_TRUSTED_NAME, isDurationPlausible } from './trackMatching';
import { tryClaimSync, releaseSyncClaim, downloadPendingVideos } from './syncService';
import { createLog } from './auditLog';

const CONCURRENCY = 4;
const SEARCH_RESULTS_PER_LINE = 5;

interface ResolvedTrack {
  youtubeId: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
}

// A pasted YouTube link is trusted as-is — the user picked that exact video,
// so this only needs to fetch its metadata, not judge it. Returns null (skip
// the line) for anything that doesn't parse or isn't available.
async function resolveUrlLine(line: string): Promise<ResolvedTrack | null> {
  const videoId = parseVideoId(line);
  if (!videoId) return null;
  const meta = await fetchVideoMetadata(videoId);
  if (!meta) return null;
  return { youtubeId: meta.id, title: meta.title, channelName: meta.channelName, thumbnailUrl: meta.thumbnailUrl, duration: meta.duration };
}

// A free-text "Artist - Title" line has no video behind it yet — search
// YouTube and only accept a result that actually resembles what was typed,
// using the same tiered text-matching this app already trusts for "is this
// really the same song" elsewhere (trackMatching.ts's MATCH_TIERS, normally
// used to judge a quality-upgrade candidate against a track we already have
// confirmed). MATCH_TIERS_TRUSTED_NAME is the right variant here, not plain
// MATCH_TIERS — its first three tiers don't require duration corroboration
// at all (this line has no known duration to corroborate with, being newly
// typed), and its one tier that does (loose fuzzy-title similarity) simply
// never clears isDurationPlausible's requireKnownDuration check against a
// null duration — so it's automatically excluded rather than needing to be
// hand-filtered out. No result clearing any tier means: skip the line
// entirely, same "return null, accept the gap" convention
// playlistGenerator.ts's findAlternative already uses.
async function resolveTextLine(line: string): Promise<ResolvedTrack | null> {
  const { artist, title } = splitArtistTitle(line);
  if (!artist) return null; // shouldn't happen given the frontend's own validation, but defensive

  const results = await searchTopMatches(`${artist} ${title}`, SEARCH_RESULTS_PER_LINE);
  if (results.length === 0) return null;

  for (const tier of MATCH_TIERS_TRUSTED_NAME) {
    for (const r of results) {
      const parsed = parseArtistAndTitle(r.title, r.channelName);
      if (!tier.textMatch(parsed.artist ?? '', parsed.title, artist, title)) continue;
      if (!isDurationPlausible(r.duration, null, tier.durationStrictness, tier.requireKnownDuration)) continue;
      return { youtubeId: r.id, title: r.title, channelName: r.channelName, thumbnailUrl: r.thumbnailUrl, duration: r.duration };
    }
  }
  return null;
}

async function resolveLine(line: string): Promise<ResolvedTrack | null> {
  return parseVideoId(line) ? resolveUrlLine(line) : resolveTextLine(line);
}

// Resolves every pasted line concurrently (bounded, same CONCURRENCY as
// playlistGenerator.ts's own worker pool), preserving the original line
// order in the result regardless of which workers finish first, and
// dropping duplicates (a URL and a text search could coincidentally resolve
// to the same video) — createMany's skipDuplicates below is the DB-level
// backstop, this just avoids inflating videoCount with an in-batch repeat.
async function resolveLines(lines: string[]): Promise<ResolvedTrack[]> {
  const resolved: (ResolvedTrack | null)[] = Array.from({ length: lines.length }, () => null);
  let cursor = 0;

  async function worker(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = cursor++;
      if (index >= lines.length) return;
      resolved[index] = await resolveLine(lines[index]);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const seen = new Set<string>();
  const ordered: ResolvedTrack[] = [];
  for (const track of resolved) {
    if (!track || seen.has(track.youtubeId)) continue;
    seen.add(track.youtubeId);
    ordered.push(track);
  }
  return ordered;
}

export interface StartCreateResult {
  started: boolean;
  error?: string;
  playlistId?: string;
}

export async function startCreatePlaylist(userId: string, name: string, lines: string[]): Promise<StartCreateResult> {
  if (!isOnline()) return { started: false, error: 'This service is offline' };

  const newPlaylist = await prisma.playlist.create({
    data: {
      userId,
      youtubeId: null,
      origin: 'created',
      title: name,
      syncStatus: lines.length > 0 ? 'creating' : 'idle',
    },
  });

  if (lines.length > 0) {
    runCreate(newPlaylist.id, lines).catch((err) => {
      console.error(`[create] Fatal error creating playlist ${newPlaylist.id}:`, err);
    });
  } else {
    void logCreationResult(newPlaylist.id, 0);
  }

  return { started: true, playlistId: newPlaylist.id };
}

async function logCreationResult(newPlaylistId: string, failedCount: number): Promise<void> {
  try {
    const playlist = await prisma.playlist.findUnique({ where: { id: newPlaylistId } });
    if (!playlist) return;
    await createLog({
      userId: playlist.userId,
      action: 'created_playlist_created',
      playlistId: playlist.id,
      details: {
        name: playlist.customName ?? playlist.title,
        songCount: playlist.videoCount,
        failedCount,
        status: playlist.syncStatus,
      },
    });
  } catch (err) {
    console.error(`[create] Failed to log creation result for ${newPlaylistId}:`, err);
  }
}

async function runCreate(newPlaylistId: string, lines: string[]): Promise<void> {
  try {
    const tracks = await resolveLines(lines);

    if (tracks.length > 0) {
      await prisma.playlistVideo.createMany({
        data: tracks.map((t, idx) => ({
          playlistId: newPlaylistId,
          youtubeId: t.youtubeId,
          title: t.title,
          originalTitle: t.title,
          duration: t.duration,
          thumbnailUrl: t.thumbnailUrl,
          position: idx + 1,
          isAvailable: true,
          channelName: t.channelName,
          downloadStatus: 'pending',
        })),
        skipDuplicates: true,
      });
    }

    // Same skipDuplicates-safe recount as POST /playlists (routes/youtube.ts)
    // — a coincidental duplicate youtubeId across two different lines can
    // make createMany insert fewer rows than tracks.length.
    const actualCount = await prisma.playlistVideo.count({ where: { playlistId: newPlaylistId } });
    await prisma.playlist.update({
      where: { id: newPlaylistId },
      data: { videoCount: actualCount, syncStatus: 'syncing' },
    });

    if (!tryClaimSync(newPlaylistId)) return; // shouldn't happen — defensive only
    try {
      // Unlike playlistGenerator.ts's generated playlists, a created
      // playlist's failed rows are left in place (not auto-removed) — these
      // are real per-line resolution/download failures the user can act on
      // via the normal "Retry Failed" action, not self-filtered candidates
      // with nothing left to retry.
      await downloadPendingVideos(newPlaylistId);
    } finally {
      releaseSyncClaim(newPlaylistId);
    }

    const failedCount = await prisma.playlistVideo.count({ where: { playlistId: newPlaylistId, downloadStatus: 'failed' } });
    await logCreationResult(newPlaylistId, failedCount);
  } catch (err) {
    console.error(`[create] Error creating playlist ${newPlaylistId}:`, err);
    await prisma.playlist.update({ where: { id: newPlaylistId }, data: { syncStatus: 'error' } }).catch(() => {});
    await logCreationResult(newPlaylistId, 0);
  }
}
