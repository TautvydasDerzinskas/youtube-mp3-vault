// One-time backfill: removes "Electronic" (and any other genre listed in
// services/excludedGenres.ts) from every already-tagged PlaylistVideo's
// `genres` array — the exclusion added there only stops *new* audio-analysis
// passes from producing it, it doesn't touch tracks analyzed before that
// change, which never get automatically re-analyzed. Safe to re-run —
// anything with nothing to strip is skipped.
//
// Usage (from the backend container, after a build that includes this
// script): `node dist/scripts/stripExcludedGenres.js [--dry-run]`.
import { prisma } from '../services/prisma';
import { stripExcludedGenres } from '../services/excludedGenres';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const videos = await prisma.playlistVideo.findMany({
    where: { genres: { isEmpty: false } },
    select: { id: true, genres: true },
  });

  console.log(`[backfill] ${videos.length} video(s) to check${DRY_RUN ? ' (dry run)' : ''}`);

  let updated = 0;
  let skipped = 0;

  for (const video of videos) {
    const cleaned = stripExcludedGenres(video.genres);
    if (cleaned.length === video.genres.length) {
      skipped++;
      continue;
    }

    console.log(`[backfill] ${video.id}: [${video.genres.join(', ')}] -> [${cleaned.join(', ')}]`);
    if (DRY_RUN) {
      updated++;
      continue;
    }

    await prisma.playlistVideo.update({ where: { id: video.id }, data: { genres: cleaned } });
    updated++;
  }

  console.log(`[backfill] Done. updated=${updated} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error('[backfill] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
