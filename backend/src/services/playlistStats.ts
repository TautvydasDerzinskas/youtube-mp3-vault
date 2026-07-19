import { prisma } from './prisma';

/** Attach download stats (counts, total size, in-flight video) to playlist rows. */
export async function withDownloadStats<T extends { id: string }>(playlists: T[]) {
  if (playlists.length === 0) {
    return playlists.map((p) => ({ ...p, downloadedCount: 0, failedCount: 0, totalSize: 0, currentVideo: null }));
  }

  const [stats, downloading] = await Promise.all([
    prisma.playlistVideo.groupBy({
      by: ['playlistId', 'downloadStatus'],
      where: { playlistId: { in: playlists.map((p) => p.id) } },
      _count: { id: true },
      _sum: { fileSize: true },
    }),
    prisma.playlistVideo.findMany({
      where: { playlistId: { in: playlists.map((p) => p.id) }, downloadStatus: 'downloading' },
      select: { playlistId: true, title: true, position: true },
    }),
  ]);

  const map = new Map<string, Record<string, number>>();
  const sizeMap = new Map<string, number>();
  for (const s of stats) {
    if (!map.has(s.playlistId)) map.set(s.playlistId, {});
    map.get(s.playlistId)![s.downloadStatus] = s._count.id;
    if (s.downloadStatus === 'done') sizeMap.set(s.playlistId, s._sum.fileSize ?? 0);
  }

  const currentVideoMap = new Map<string, { title: string; position: number }>();
  for (const v of downloading) {
    currentVideoMap.set(v.playlistId, { title: v.title, position: v.position });
  }

  return playlists.map((p) => ({
    ...p,
    downloadedCount: map.get(p.id)?.done ?? 0,
    failedCount: map.get(p.id)?.failed ?? 0,
    totalSize: sizeMap.get(p.id) ?? 0,
    currentVideo: currentVideoMap.get(p.id) ?? null,
  }));
}
