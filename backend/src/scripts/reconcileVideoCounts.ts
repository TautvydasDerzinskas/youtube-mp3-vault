import { prisma } from '../services/prisma';

// One-off maintenance script — recomputes every playlist's videoCount from
// its actual PlaylistVideo rows, correcting any drift left over from a
// partial/interrupted sync (e.g. two overlapping sync attempts racing
// across a redeploy). Going forward this can't recur — refreshPlaylistFromYoutube
// and the playlist-import route now compute videoCount the same way instead
// of trusting the raw YouTube fetch count — so this only ever needs to run
// once to clean up any playlists that already drifted before that fix.
//
// Run via the compiled build (production has no ts-node):
//   docker compose exec backend npm run reconcile-video-counts
// (equivalent to `node dist/scripts/reconcileVideoCounts.js` once built)
async function main() {
  const playlists = await prisma.playlist.findMany({
    select: { id: true, title: true, customName: true, videoCount: true },
  });

  let fixedCount = 0;
  for (const playlist of playlists) {
    const actualCount = await prisma.playlistVideo.count({
      where: { playlistId: playlist.id, downloadStatus: { not: 'removed' } },
    });
    if (actualCount !== playlist.videoCount) {
      const name = playlist.customName ?? playlist.title;
      console.log(`[reconcile] "${name}" (${playlist.id}): videoCount ${playlist.videoCount} -> ${actualCount}`);
      await prisma.playlist.update({ where: { id: playlist.id }, data: { videoCount: actualCount } });
      fixedCount++;
    }
  }

  console.log(`[reconcile] Done — checked ${playlists.length} playlist(s), fixed ${fixedCount}.`);
}

main()
  .catch((err) => {
    console.error('[reconcile] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
