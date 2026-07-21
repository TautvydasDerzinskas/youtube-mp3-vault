import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../services/prisma';
import { topGenresByTrackCount } from '../services/genreStats';

const router = Router();

router.use(requireAuth);

const TOP_SONGS_PREVIEW = 10;
const TOP_ARTISTS_PREVIEW = 10;
const TOP_GENRES_PREVIEW = 5;
// Defensive ceilings for the "see more" lists — songs are already bounded to
// ones actually listened to at least once, artists per the product decision
// to cap this at 20-50 rather than every distinct artist in a large library.
// Genres realistically never approach this, but the same ceiling style is
// cheap insurance against an unbounded response either way.
const MAX_SONGS_LIST = 500;
const MAX_ARTISTS_LIST = 50;
const MAX_GENRES_LIST = 500;

const SONG_SELECT = {
  id: true, playlistId: true, youtubeId: true, title: true, artist: true,
  thumbnailUrl: true, playCount: true, lastPlayedAt: true,
} as const;

// Ranked by track count in the user's library, not by listen count — a
// deliberately different metric from the "songs on repeat" card above it.
async function topArtistsByTrackCount(userId: string, limit: number) {
  const groups = await prisma.playlistVideo.groupBy({
    by: ['artist'],
    where: {
      playlist: { userId },
      artist: { not: null },
      isAvailable: true,
      downloadStatus: { not: 'removed' },
    },
    _count: { id: true },
  });

  return groups
    .map((g) => ({ artist: g.artist as string, songCount: g._count.id }))
    .sort((a, b) => b.songCount - a.songCount)
    .slice(0, limit);
}

// GET /api/dashboard/summary — one call powers the whole dashboard page.
router.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!;

    const [playlistCount, totalSongCount, topSongs, topArtists, topGenres] = await Promise.all([
      prisma.playlist.count({ where: { userId } }),
      prisma.playlistVideo.count({
        where: { playlist: { userId }, isAvailable: true, downloadStatus: { not: 'removed' } },
      }),
      prisma.playlistVideo.findMany({
        where: {
          playlist: { userId },
          playCount: { gt: 0 },
          isAvailable: true,
          downloadStatus: { not: 'removed' },
        },
        orderBy: { playCount: 'desc' },
        take: TOP_SONGS_PREVIEW,
        select: SONG_SELECT,
      }),
      topArtistsByTrackCount(userId, TOP_ARTISTS_PREVIEW),
      topGenresByTrackCount(userId, TOP_GENRES_PREVIEW),
    ]);

    res.json({ playlistCount, totalSongCount, topSongs, topArtists, topGenres });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/songs — backs the "see more" modal on the songs card.
router.get('/songs', async (req: AuthRequest, res, next) => {
  try {
    const songs = await prisma.playlistVideo.findMany({
      where: {
        playlist: { userId: req.userId },
        playCount: { gt: 0 },
        isAvailable: true,
        downloadStatus: { not: 'removed' },
      },
      orderBy: { playCount: 'desc' },
      take: MAX_SONGS_LIST,
      select: SONG_SELECT,
    });
    res.json({ songs });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/artists — backs the "see more" modal on the artists card.
router.get('/artists', async (req: AuthRequest, res, next) => {
  try {
    const artists = await topArtistsByTrackCount(req.userId!, MAX_ARTISTS_LIST);
    res.json({ artists });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/genres — backs both the dashboard's "see more" modal on
// the genres card and the standalone Genres page (same dataset either way).
router.get('/genres', async (req: AuthRequest, res, next) => {
  try {
    const genres = await topGenresByTrackCount(req.userId!, MAX_GENRES_LIST);
    res.json({ genres });
  } catch (err) {
    next(err);
  }
});

export default router;
