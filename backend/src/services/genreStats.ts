import { prisma } from './prisma';

export interface GenreCount {
  key: string;
  genre: string;
  count: number;
}

function normalizeGenreKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function formatGenreLabel(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
}

// Ranked by how many of the user's songs are tagged with each genre.
// PlaylistVideo.genres is an array column Prisma can't groupBy directly, so
// this pulls just that field and aggregates in memory — mirrors the same
// case/whitespace normalization the per-playlist genre filter already does
// client-side (frontend's hooks/genreFilter.ts computeGenreCounts), so the
// same genre displays identically everywhere in the app. Untagged videos
// (empty genres array) are simply not counted — there's no "no genre"
// bucket here, unlike the per-playlist filter, since that's not something
// worth browsing to from a dashboard/genres list.
export async function topGenresByTrackCount(userId: string, limit: number): Promise<GenreCount[]> {
  const videos = await prisma.playlistVideo.findMany({
    where: { playlist: { userId }, isAvailable: true, downloadStatus: { not: 'removed' } },
    select: { genres: true },
  });

  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const v of videos) {
    for (const raw of v.genres) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = normalizeGenreKey(trimmed);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const existingLabel = labels.get(key);
      if (!existingLabel || (!/^[A-Z]/.test(existingLabel) && /^[A-Z]/.test(trimmed))) {
        labels.set(key, trimmed);
      }
    }
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, genre: formatGenreLabel(labels.get(key)!), count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, limit);
}
