// One-time backfill: renames every existing shared mp3 from its raw
// `${youtubeId}.mp3` name to a clean "Artist - Title.mp3" name, so files
// downloaded before this feature existed match what new downloads get via
// metadataWorker.ts's rename-on-resolve step. Safe to re-run — anything
// already carrying its clean name is skipped.
//
// Usage (from the backend container, after a build that includes this
// script): `node dist/scripts/renameLibraryFiles.js [--dry-run]`.
import { prisma } from '../services/prisma';
import { buildCleanFilename, renameSharedFile } from '../services/downloader';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const mediaFiles = await prisma.mediaFile.findMany({
    include: {
      videos: {
        where: { downloadStatus: { not: 'removed' } },
        select: { artist: true, title: true },
        take: 1,
      },
    },
  });

  console.log(`[backfill] ${mediaFiles.length} media file(s) to check${DRY_RUN ? ' (dry run)' : ''}`);

  let renamed = 0;
  let skipped = 0;
  let failed = 0;

  // Sequential, not parallel — buildCleanFilename's collision check reads
  // live DB state, so two files that would otherwise resolve to the same
  // clean name must be processed one at a time for the second one to see
  // the first's already-renamed row and correctly disambiguate itself.
  for (const mediaFile of mediaFiles) {
    const video = mediaFile.videos[0];
    if (!video) {
      // Every referencing PlaylistVideo was removed but the MediaFile itself
      // wasn't GC'd yet — shouldn't normally happen (see tryDeleteMediaFile),
      // but there's no artist/title to build a clean name from either way.
      console.warn(`[backfill] ${mediaFile.filename}: no referencing video — skipping`);
      skipped++;
      continue;
    }

    const desired = await buildCleanFilename(video.artist, video.title, mediaFile.youtubeId);
    if (desired === mediaFile.filename) {
      skipped++;
      continue;
    }

    console.log(`[backfill] ${mediaFile.filename} -> ${desired}`);
    if (DRY_RUN) {
      renamed++;
      continue;
    }

    try {
      await renameSharedFile(mediaFile.filename, desired);
      await prisma.mediaFile.update({ where: { id: mediaFile.id }, data: { filename: desired } });
      renamed++;
    } catch (err) {
      console.error(`[backfill] Failed to rename ${mediaFile.filename} -> ${desired}:`, (err as Error).message);
      failed++;
    }
  }

  console.log(`[backfill] Done. renamed=${renamed} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error('[backfill] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
