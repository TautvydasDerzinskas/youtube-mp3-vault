import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { parseVideoId, fetchVideoMetadata, searchTopMatches } from './youtube';
import { parseArtistAndTitle } from './musicbrainz';
import { splitArtistTitle, MATCH_TIERS_TRUSTED_NAME, isDurationPlausible } from './trackMatching';
import { tryClaimSync, releaseSyncClaim, downloadPendingVideos } from './syncService';
import { createLog } from './auditLog';

const CONCURRENCY = 4;
const SEARCH_RESULTS_PER_LINE = 5;

// Columns pulled for every track already in the requesting user's own
// library (see fetchLibraryCandidates) — enough to run the exact same
// tier-based text/duration matching used against a fresh YouTube search
// (findTierMatch below), plus every enrichment column worth copying
// straight onto the new row when a line matches one of these instead of
// something freshly found on YouTube (see toResolvedTrack).
const LIBRARY_CANDIDATE_SELECT = {
  id: true, youtubeId: true, title: true, originalTitle: true, artist: true, channelName: true,
  duration: true, thumbnailUrl: true, album: true, trackNumber: true, releaseYear: true, mbRecordingId: true,
  metadataStatus: true, metadataFetchedAt: true, genres: true, audioAnalysisStatus: true, audioAnalysisFetchedAt: true,
  betterQualityExists: true, qualityCheckStatus: true, qualityCheckedAt: true, hqFileDownloaded: true,
  mediaFileId: true, fileSize: true, bitrate: true, downloadStatus: true,
} satisfies Prisma.PlaylistVideoSelect;

type LibraryCandidate = Prisma.PlaylistVideoGetPayload<{ select: typeof LIBRARY_CANDIDATE_SELECT }>;

// Fetched once per create pass (not once per line — see resolveLines) so
// checking every pasted line against "does the user already have this"
// costs one query total, not one per line. Scoped to this user's own
// playlists only, same isolation as everything else in this app; 'removed'
// rows are excluded by pickBestCandidate below rather than here, so a video
// that's since been dropped everywhere else can still fall through to a
// fresh, up-to-date fetchVideoMetadata/search instead of silently reusing a
// known-dead one.
async function fetchLibraryCandidates(userId: string): Promise<LibraryCandidate[]> {
  return prisma.playlistVideo.findMany({
    where: { playlist: { userId }, isAvailable: true },
    select: LIBRARY_CANDIDATE_SELECT,
  });
}

// The same video/song can legitimately already sit in more than one of the
// user's own playlists — this picks the best of however many matched.
// 'done' means the file is already downloaded, so reusing it skips the
// download step too, not just the search/metadata fetch; 'removed' is
// excluded outright (not just ranked last) rather than trusted as a stand-in
// for a fresh answer — see fetchLibraryCandidates above.
const REUSE_STATUS_RANK: Record<string, number> = { done: 0, downloading: 1, pending: 2, failed: 3 };
function pickBestCandidate<T extends { downloadStatus: string }>(matches: T[]): T | null {
  const eligible = matches.filter((m) => m.downloadStatus !== 'removed');
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => (REUSE_STATUS_RANK[a.downloadStatus] ?? 9) - (REUSE_STATUS_RANK[b.downloadStatus] ?? 9))[0];
}

// Runs MATCH_TIERS_TRUSTED_NAME against an arbitrary candidate pool — used
// identically for the user's own library (candidateArtist/Title already
// live in their own columns) and for a fresh YouTube search's results
// (candidateArtist/Title come from parseArtistAndTitle on the raw upload
// title, see resolveTextLine) — same confidence bar either way, first tier
// to produce any surviving candidate wins.
function findTierMatch<T>(
  candidates: T[],
  artist: string,
  title: string,
  getCandidate: (c: T) => { artist: string; title: string; duration: number | null },
): T | null {
  for (const tier of MATCH_TIERS_TRUSTED_NAME) {
    for (const c of candidates) {
      const { artist: ca, title: ct, duration } = getCandidate(c);
      if (!tier.textMatch(ca, ct, artist, title)) continue;
      if (!isDurationPlausible(duration, null, tier.durationStrictness, tier.requireKnownDuration)) continue;
      return c;
    }
  }
  return null;
}

interface ResolvedTrack {
  youtubeId: string;
  title: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  // Set when this line matched a track already in the user's own library
  // instead of being freshly resolved from YouTube — runCreate copies these
  // extra columns straight onto the new row so a re-added track keeps its
  // existing enrichment/download state instead of starting the metadata/
  // audio-analysis/download pipeline all over again from scratch.
  reusedFrom?: LibraryCandidate;
}

function toResolvedTrack(existing: LibraryCandidate): ResolvedTrack {
  return {
    youtubeId: existing.youtubeId,
    title: existing.title,
    channelName: existing.channelName,
    thumbnailUrl: existing.thumbnailUrl,
    duration: existing.duration,
    reusedFrom: existing,
  };
}

// A pasted YouTube link is trusted as-is — the user picked that exact video,
// so this only needs to fetch its metadata, not judge it. Returns null (skip
// the line) for anything that doesn't parse or isn't available.
async function resolveUrlLine(line: string, libraryCandidates: LibraryCandidate[]): Promise<ResolvedTrack | null> {
  const videoId = parseVideoId(line);
  if (!videoId) {
    console.warn(`[create] line did not parse as a video URL, skipping: "${line}"`);
    return null;
  }

  // Same video ID already sitting in one of this user's own playlists —
  // reuse it (metadata, enrichment, and the downloaded file itself if it has
  // one) instead of spending a yt-dlp round-trip re-fetching what's already
  // known.
  const existing = pickBestCandidate(libraryCandidates.filter((c) => c.youtubeId === videoId));
  if (existing) {
    console.log(`[create] "${line}" -> already in library as youtubeId ${videoId} (playlistVideo ${existing.id}), reusing instead of re-fetching from YouTube`);
    return toResolvedTrack(existing);
  }

  const meta = await fetchVideoMetadata(videoId);
  if (!meta) {
    console.warn(`[create] no metadata for video ${videoId} ("${line}") — unavailable/private/deleted, skipping`);
    return null;
  }
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
async function resolveTextLine(line: string, libraryCandidates: LibraryCandidate[]): Promise<ResolvedTrack | null> {
  const { artist, title } = splitArtistTitle(line);
  if (!artist) {
    console.warn(`[create] line didn't split into artist/title, skipping: "${line}"`);
    return null;
  }

  // Checked against the user's own library BEFORE ever touching YouTube —
  // if a track that already matches "Artist - Title" exists, reuse it
  // rather than searching for and possibly importing a second, redundant
  // copy of the same song.
  const existingMatch = findTierMatch(libraryCandidates, artist, title,
    (c) => ({ artist: c.artist ?? c.channelName ?? '', title: c.title, duration: c.duration }));
  if (existingMatch) {
    console.log(`[create] "${line}" -> already in library as "${existingMatch.artist ?? existingMatch.channelName} - ${existingMatch.title}" (${existingMatch.youtubeId}), reusing instead of searching YouTube`);
    return toResolvedTrack(existingMatch);
  }

  const query = `${artist} ${title}`;
  const results = await searchTopMatches(query, SEARCH_RESULTS_PER_LINE);
  if (results.length === 0) {
    console.warn(`[create] no search results at all for "${line}" (query: "${query}")`);
    return null;
  }

  for (const tier of MATCH_TIERS_TRUSTED_NAME) {
    for (const r of results) {
      const parsed = parseArtistAndTitle(r.title, r.channelName);
      if (!tier.textMatch(parsed.artist ?? '', parsed.title, artist, title)) continue;
      if (!isDurationPlausible(r.duration, null, tier.durationStrictness, tier.requireKnownDuration)) continue;
      console.log(`[create] "${line}" -> "${r.title}" (${r.id}, channel "${r.channelName}", parsed as "${parsed.artist} - ${parsed.title}")`);
      return { youtubeId: r.id, title: r.title, channelName: r.channelName, thumbnailUrl: r.thumbnailUrl, duration: r.duration };
    }
  }
  // Nothing cleared any tier — log exactly what was compared against so a
  // report like "I typed X and it didn't add anything" is diagnosable from
  // server logs alone, without needing to reproduce it by hand.
  const candidateSummary = results
    .map(r => { const p = parseArtistAndTitle(r.title, r.channelName); return `"${p.artist ?? '?'} - ${p.title}" (raw: "${r.title}", channel: "${r.channelName}")`; })
    .join('; ');
  console.warn(`[create] no confident match for "${line}" (parsed as "${artist} - ${title}") among ${results.length} results: ${candidateSummary}`);
  return null;
}

async function resolveLine(line: string, libraryCandidates: LibraryCandidate[]): Promise<ResolvedTrack | null> {
  return parseVideoId(line) ? resolveUrlLine(line, libraryCandidates) : resolveTextLine(line, libraryCandidates);
}

// Resolves every pasted line concurrently (bounded, same CONCURRENCY as
// playlistGenerator.ts's own worker pool), preserving the original line
// order in the result regardless of which workers finish first, and
// dropping duplicates (a URL and a text search could coincidentally resolve
// to the same video) — createMany's skipDuplicates below is the DB-level
// backstop, this just avoids inflating videoCount with an in-batch repeat.
// The user's library is fetched once up front (not once per line) so every
// line's existing-track check (see resolveUrlLine/resolveTextLine) costs
// one query total for the whole paste, not one per line.
async function resolveLines(lines: string[], userId: string): Promise<ResolvedTrack[]> {
  const libraryCandidates = await fetchLibraryCandidates(userId);
  const resolved: (ResolvedTrack | null)[] = Array.from({ length: lines.length }, () => null);
  let cursor = 0;

  async function worker(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const index = cursor++;
      if (index >= lines.length) return;
      resolved[index] = await resolveLine(lines[index], libraryCandidates);
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
    runCreate(newPlaylist.id, lines, userId).catch((err) => {
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

async function runCreate(newPlaylistId: string, lines: string[], userId: string): Promise<void> {
  try {
    const tracks = await resolveLines(lines, userId);
    console.log(`[create] playlist ${newPlaylistId}: resolved ${tracks.length}/${lines.length} pasted line(s)`);

    if (tracks.length > 0) {
      await prisma.playlistVideo.createMany({
        data: tracks.map((t, idx) => {
          const existing = t.reusedFrom;
          return {
            playlistId: newPlaylistId,
            youtubeId: t.youtubeId,
            title: t.title,
            originalTitle: existing?.originalTitle ?? t.title,
            duration: t.duration,
            thumbnailUrl: t.thumbnailUrl,
            position: idx + 1,
            isAvailable: true,
            channelName: t.channelName,
            downloadStatus: 'pending',
            // A matched existing track (see resolveUrlLine/resolveTextLine)
            // brings its own enrichment straight over instead of starting
            // metadata/audio-analysis from scratch — and, if it's already
            // been downloaded somewhere else, its file too (mediaFileId is
            // shared across playlists, same as a regular sync's own
            // dedupe — see resolveMediaFile in syncService.ts), skipping
            // the download step entirely for this row.
            ...(existing ? {
              artist: existing.artist,
              album: existing.album,
              trackNumber: existing.trackNumber,
              releaseYear: existing.releaseYear,
              mbRecordingId: existing.mbRecordingId,
              metadataStatus: existing.metadataStatus,
              metadataFetchedAt: existing.metadataFetchedAt,
              genres: existing.genres,
              audioAnalysisStatus: existing.audioAnalysisStatus,
              audioAnalysisFetchedAt: existing.audioAnalysisFetchedAt,
              betterQualityExists: existing.betterQualityExists,
              qualityCheckStatus: existing.qualityCheckStatus,
              qualityCheckedAt: existing.qualityCheckedAt,
              hqFileDownloaded: existing.hqFileDownloaded,
              ...(existing.downloadStatus === 'done' && existing.mediaFileId ? {
                downloadStatus: 'done',
                mediaFileId: existing.mediaFileId,
                fileSize: existing.fileSize,
                bitrate: existing.bitrate,
              } : {}),
            } : {}),
          };
        }),
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
