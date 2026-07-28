import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { normalizeKey, preferLabel } from './textNormalization';
import { GenreCount } from './genreStats';

export interface ArtistSummary {
  key: string;
  name: string;
  songCount: number;
  totalPlayCount: number;
  thumbnailUrl: string | null;
}

const ARTIST_VIDEO_SELECT = {
  id: true, playlistId: true, youtubeId: true, title: true, duration: true,
  thumbnailUrl: true, position: true, isAvailable: true, downloadStatus: true,
  downloadError: true, fileSize: true, bitrate: true, addedAt: true, artist: true,
  album: true, trackNumber: true, genres: true, releaseYear: true, metadataStatus: true,
  playCount: true, lastPlayedAt: true, betterQualityExists: true, hqFileDownloaded: true,
} as const;

const BASE_WHERE = {
  artist: { not: null },
  isAvailable: true,
  downloadStatus: { not: 'removed' },
} satisfies Prisma.PlaylistVideoWhereInput;

// Alphabetical list of every distinct artist across the user's library, each
// with a track count and a representative thumbnail (the earliest-added
// track's — arbitrary but deterministic, avoids a second query just to pick
// one). When `search` is given, matches against artist name OR song title
// before aggregating, so "search songs too" doesn't require shipping every
// artist's full track-title list to the frontend just to filter locally.
export async function listArtists(userId: string, search?: string): Promise<ArtistSummary[]> {
  const trimmed = search?.trim();
  const searchFilter: Prisma.PlaylistVideoWhereInput = trimmed
    ? {
        OR: [
          { artist: { contains: trimmed, mode: 'insensitive' } },
          { title: { contains: trimmed, mode: 'insensitive' } },
        ],
      }
    : {};

  const videos = await prisma.playlistVideo.findMany({
    where: { playlist: { userId }, ...BASE_WHERE, ...searchFilter },
    orderBy: { addedAt: 'asc' },
    select: { artist: true, thumbnailUrl: true, playCount: true },
  });

  const groups = new Map<string, { label: string; count: number; playCount: number; thumbnailUrl: string | null }>();
  for (const v of videos) {
    const raw = v.artist!.trim();
    if (!raw) continue;
    const key = normalizeKey(raw);
    const g = groups.get(key) ?? { label: raw, count: 0, playCount: 0, thumbnailUrl: null };
    g.count += 1;
    g.playCount += v.playCount;
    g.label = preferLabel(g.label, raw);
    if (!g.thumbnailUrl && v.thumbnailUrl) g.thumbnailUrl = v.thumbnailUrl;
    groups.set(key, g);
  }

  return [...groups.entries()]
    .map(([key, g]) => ({ key, name: g.label, songCount: g.count, totalPlayCount: g.playCount, thumbnailUrl: g.thumbnailUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PlaylistRef {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface ArtistDetail {
  key: string;
  name: string;
  thumbnailUrl: string | null;
  songCount: number;
  totalPlayCount: number;
  playlists: PlaylistRef[];
  genres: GenreCount[];
  videos: Array<Prisma.PlaylistVideoGetPayload<{ select: typeof ARTIST_VIDEO_SELECT }>>;
}

// artistKey is a normalized (trim+lowercase) name — there's no dedicated
// Artist row to look up by id, so this re-derives the same grouping
// listArtists does, filtered down to the one key. Returns null if nothing in
// this user's library currently normalizes to that key (e.g. a stale link
// after the artist's only tracks were removed).
export async function getArtistDetail(userId: string, artistKey: string): Promise<ArtistDetail | null> {
  const videos = await prisma.playlistVideo.findMany({
    where: { playlist: { userId }, ...BASE_WHERE },
    orderBy: { addedAt: 'desc' },
    select: ARTIST_VIDEO_SELECT,
  });

  const matched = videos.filter((v) => normalizeKey(v.artist!) === artistKey);
  if (matched.length === 0) return null;

  let label = matched[0].artist!.trim();
  let thumbnailUrl: string | null = null;
  let totalPlayCount = 0;
  const genreCounts = new Map<string, number>();
  const genreLabels = new Map<string, string>();
  const playlistIds = new Set<string>();

  for (const v of matched) {
    label = preferLabel(label, v.artist!.trim());
    if (!thumbnailUrl && v.thumbnailUrl) thumbnailUrl = v.thumbnailUrl;
    totalPlayCount += v.playCount;
    playlistIds.add(v.playlistId);
    for (const raw of v.genres) {
      const trimmedGenre = raw.trim();
      if (!trimmedGenre) continue;
      const gKey = normalizeKey(trimmedGenre);
      genreCounts.set(gKey, (genreCounts.get(gKey) ?? 0) + 1);
      genreLabels.set(gKey, preferLabel(genreLabels.get(gKey), trimmedGenre));
    }
  }

  const genres: GenreCount[] = [...genreCounts.entries()]
    .map(([key, count]) => {
      const g = genreLabels.get(key)!;
      return { key, genre: g.charAt(0).toUpperCase() + g.slice(1), count };
    })
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));

  const playlistRows = await prisma.playlist.findMany({
    where: { id: { in: [...playlistIds] } },
    select: { id: true, title: true, customName: true, thumbnailUrl: true },
  });
  const playlists: PlaylistRef[] = playlistRows
    .map((p) => ({ id: p.id, title: p.customName ?? p.title, thumbnailUrl: p.thumbnailUrl }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    key: artistKey,
    name: label,
    thumbnailUrl,
    songCount: matched.length,
    totalPlayCount,
    playlists,
    genres,
    videos: matched,
  };
}
