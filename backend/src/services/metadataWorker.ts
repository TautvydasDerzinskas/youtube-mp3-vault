import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { lookupTrackMetadata, deriveFallbackMetadata } from './musicbrainz';
import { getTrackCorrection } from './lastfm';
import { writeTrackTags } from './id3Tags';
import { buildCleanFilename, renameSharedFile } from './downloader';

type VideoWithMediaFile = Prisma.PlaylistVideoGetPayload<{ include: { mediaFile: true } }>;

// Renames the shared mp3 to match freshly-resolved (or corrected) artist/
// title, keeping the on-disk name in sync every time metadata changes —
// both the first resolution and a later admin-forced reimport correction go
// through here. Best-effort: a rename failure just leaves the file under its
// previous (still valid) name rather than aborting metadata resolution.
async function renameToCleanFilename(
  mediaFile: { id: string; filename: string; youtubeId: string },
  artist: string | null,
  title: string,
): Promise<string> {
  const desired = await buildCleanFilename(artist, title, mediaFile.youtubeId);
  if (desired === mediaFile.filename) return mediaFile.filename;

  try {
    await renameSharedFile(mediaFile.filename, desired);
  } catch (err) {
    console.error(`[metadata] Failed to rename ${mediaFile.filename} -> ${desired}:`, (err as Error).message);
    return mediaFile.filename;
  }
  await prisma.mediaFile.update({ where: { id: mediaFile.id }, data: { filename: desired } }).catch(() => {});
  return desired;
}

// Three-tier fallback once MusicBrainz has no match: local heuristic parse
// first, then — if that produced an artist to work with — ask Last.fm to
// correct/canonicalize it. A Last.fm correction is trusted as-is (like a
// MusicBrainz match would be), since it comes from a real catalog rather
// than our regex guess; only the untouched heuristic result gets title-cased,
// since that's the only tier without an authoritative source for casing.
async function resolveFallbackMetadata(title: string, channelName: string | null): Promise<{ artist: string | null; title: string }> {
  const local = deriveFallbackMetadata(title, channelName);
  if (!local.artist) return local;

  const corrected = await getTrackCorrection(local.artist, local.title);
  return corrected ?? local;
}

// Resolves metadata (MusicBrainz, falling back to the local parser + Last.fm
// correction) for videos in this playlist. Called at the end of a playlist's
// download pass (see _downloadPending in syncService.ts) — i.e. only
// alongside sync activity a user actually triggered, rather than an
// independent background loop polling continuously regardless of activity.
//
// By default only processes videos still awaiting a first attempt
// (`metadataStatus: 'pending'`). Pass `force: true` (used by the admin soft
// reimport flow — see reimport.ts) to instead reprocess every video in the
// playlist regardless of its current status, e.g. to pick up improvements to
// the parsing/matching logic itself.
//
// onProgress (optional — only syncService.ts's downloadPendingVideos passes
// one) reports this video's 1-indexed position and the running total before
// each one is processed, so the caller can surface live per-video progress
// without this module needing to know anything about how/where that's
// displayed.
export async function resolvePlaylistMetadata(
  playlistId: string,
  options: {
    force?: boolean;
    onProgress?: (current: number, total: number, title: string) => void;
    // Fired once a video has a real, terminal verdict for this pass (found,
    // fallback, or errored) — not fired for one skipped because it vanished
    // from the DB mid-lookup (Prisma P2025 below), same "not a real verdict
    // yet" reasoning as resolvePlaylistQuality's onVideoProcessed.
    onVideoProcessed?: (videoId: string) => void;
  } = {}
): Promise<void> {
  const { force = false, onProgress, onVideoProcessed } = options;

  const videos = await prisma.playlistVideo.findMany({
    where: force
      ? { playlistId, downloadStatus: { not: 'removed' } }
      : { playlistId, metadataStatus: 'pending', downloadStatus: { not: 'removed' } },
    orderBy: { position: 'asc' },
    include: { mediaFile: true },
  });

  for (const [index, video] of videos.entries()) {
    if (!isOnline()) return;
    onProgress?.(index + 1, videos.length, video.title);

    const outcome = await resolveVideoMetadata(video);
    if (outcome === 'processed') onVideoProcessed?.(video.id);
  }
}

// 'processed' vs 'skipped' mirrors slskdQualityWorker.ts's
// QualityCheckOutcome/onVideoProcessed contract — 'skipped' only for a video
// that vanished from the DB mid-lookup (Prisma P2025), not a real verdict.
type MetadataResolveOutcome = 'processed' | 'skipped';

// One video's worth of resolvePlaylistMetadata's loop body — pulled out so
// the rename flow (see resolveMetadataForRename below) can share the
// found/not-found/error persistence logic without duplicating it.
async function resolveVideoMetadata(video: VideoWithMediaFile): Promise<MetadataResolveOutcome> {
  // Prefer the untouched original YouTube title as the search input — once
  // a video's `title` has been cleaned by an earlier pass (artist/junk
  // suffix stripped), re-deriving the search artist from it alone would
  // lose information a fresh pass could otherwise recover from. Falls back
  // to `title` for rows that predate the originalTitle column, where the
  // two are identical anyway for a video that's never been processed.
  const searchTitle = video.originalTitle ?? video.title;

  try {
    const meta = await lookupTrackMetadata(searchTitle, video.channelName, video.artist);
    if (meta) {
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: {
          artist: meta.artist, title: meta.title, album: meta.album, trackNumber: meta.trackNumber,
          releaseYear: meta.releaseYear, mbRecordingId: meta.mbRecordingId,
          metadataStatus: 'found', metadataFetchedAt: new Date(),
        },
      });
      // Re-tag the file with our own cleaned-up metadata now that it's
      // resolved — only meaningful once the mp3 actually exists on disk.
      if (video.downloadStatus === 'done' && video.mediaFile) {
        const filename = await renameToCleanFilename(video.mediaFile, meta.artist, meta.title);
        writeTrackTags(filename, {
          title: meta.title, artist: meta.artist, album: meta.album,
          trackNumber: meta.trackNumber, releaseYear: meta.releaseYear, genres: video.genres,
        });
      }
    } else {
      const fallback = await resolveFallbackMetadata(searchTitle, video.channelName);
      // Never regress a known artist to null — a rematch finding less than
      // we already knew (e.g. because the title's already been cleaned)
      // shouldn't erase previously-good data.
      const artist = fallback.artist ?? video.artist;
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: { artist, title: fallback.title, metadataStatus: 'not_found', metadataFetchedAt: new Date() },
      });
      if (video.downloadStatus === 'done' && video.mediaFile) {
        const filename = await renameToCleanFilename(video.mediaFile, artist, fallback.title);
        writeTrackTags(filename, {
          title: fallback.title, artist, album: video.album,
          trackNumber: video.trackNumber, releaseYear: video.releaseYear, genres: video.genres,
        });
      }
    }
    return 'processed';
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return 'skipped';

    console.error(`[metadata] Failed for ${video.youtubeId}:`, (err as Error).message);
    await prisma.playlistVideo
      .update({ where: { id: video.id }, data: { metadataStatus: 'error', metadataFetchedAt: new Date() } })
      .catch(() => {});
    return 'processed';
  }
}

// Used by the track context menu's "Rename track" action (see
// slskdQualityWorker.ts's renameTrack) — re-attempts a MusicBrainz match
// seeded with the user's own manually-provided artist/title, as opposed to
// resolveVideoMetadata's automatic originalTitle-based search, since the
// whole point of a manual rename is "the automatic parse got this wrong,
// here's what it should actually be." A real MB match still wins with its
// own canonical artist/title/album/etc. over the user's input (same as
// resolveVideoMetadata's found-path always does) — but if MB has nothing,
// the user's typed values are kept as-is rather than being run back through
// the local-heuristic-fallback pass a first-ever automatic resolution would
// use, since that fallback exists to *guess* an artist/title from scratch,
// not to second-guess a human who already typed one.
export async function resolveMetadataForRename(video: VideoWithMediaFile, artist: string | null, title: string): Promise<void> {
  const meta = await lookupTrackMetadata(title, video.channelName, artist);
  if (meta) {
    await prisma.playlistVideo.update({
      where: { id: video.id },
      data: {
        artist: meta.artist, title: meta.title, album: meta.album, trackNumber: meta.trackNumber,
        releaseYear: meta.releaseYear, mbRecordingId: meta.mbRecordingId,
        metadataStatus: 'found', metadataFetchedAt: new Date(),
      },
    });
    if (video.downloadStatus === 'done' && video.mediaFile) {
      const filename = await renameToCleanFilename(video.mediaFile, meta.artist, meta.title);
      writeTrackTags(filename, {
        title: meta.title, artist: meta.artist, album: meta.album,
        trackNumber: meta.trackNumber, releaseYear: meta.releaseYear, genres: video.genres,
      });
    }
    return;
  }

  await prisma.playlistVideo.update({
    where: { id: video.id },
    data: { metadataStatus: 'not_found', metadataFetchedAt: new Date() },
  });
  if (video.downloadStatus === 'done' && video.mediaFile) {
    const filename = await renameToCleanFilename(video.mediaFile, artist, title);
    writeTrackTags(filename, {
      title, artist, album: video.album,
      trackNumber: video.trackNumber, releaseYear: video.releaseYear, genres: video.genres,
    });
  }
}
