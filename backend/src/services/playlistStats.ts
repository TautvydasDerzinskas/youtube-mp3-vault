import { prisma } from './prisma';

/** Attach download stats (counts, total size, in-flight video) to playlist rows. */
export async function withDownloadStats<T extends { id: string; videoCount: number }>(playlists: T[]) {
  if (playlists.length === 0) {
    return playlists.map((p) => ({ ...p, downloadedCount: 0, failedCount: 0, totalSize: 0, currentVideo: null }));
  }

  const [stats, downloading] = await Promise.all([
    // Split by isAvailable too — a video flagged unavailable (permanently
    // blocked/removed/private) is excluded from every count below, including
    // the total, so it doesn't drag the progress bar/chip below 100% forever.
    prisma.playlistVideo.groupBy({
      by: ['playlistId', 'downloadStatus', 'isAvailable'],
      where: { playlistId: { in: playlists.map((p) => p.id) } },
      _count: { id: true },
      _sum: { fileSize: true },
    }),
    prisma.playlistVideo.findMany({
      where: { playlistId: { in: playlists.map((p) => p.id) }, downloadStatus: 'downloading' },
      select: { playlistId: true, title: true, position: true },
    }),
  ]);

  const map = new Map<string, { done: number; failed: number; unavailable: number }>();
  const sizeMap = new Map<string, number>();
  for (const s of stats) {
    const entry = map.get(s.playlistId) ?? { done: 0, failed: 0, unavailable: 0 };
    if (!s.isAvailable) {
      entry.unavailable += s._count.id;
    } else if (s.downloadStatus === 'done') {
      entry.done += s._count.id;
      sizeMap.set(s.playlistId, (sizeMap.get(s.playlistId) ?? 0) + (s._sum.fileSize ?? 0));
    } else if (s.downloadStatus === 'failed') {
      entry.failed += s._count.id;
    }
    map.set(s.playlistId, entry);
  }

  const currentVideoMap = new Map<string, { title: string; position: number }>();
  for (const v of downloading) {
    currentVideoMap.set(v.playlistId, { title: v.title, position: v.position });
  }

  return playlists.map((p) => {
    const s = map.get(p.id) ?? { done: 0, failed: 0, unavailable: 0 };
    return {
      ...p,
      videoCount: Math.max(0, p.videoCount - s.unavailable),
      downloadedCount: s.done,
      failedCount: s.failed,
      totalSize: sizeMap.get(p.id) ?? 0,
      currentVideo: currentVideoMap.get(p.id) ?? null,
    };
  });
}
