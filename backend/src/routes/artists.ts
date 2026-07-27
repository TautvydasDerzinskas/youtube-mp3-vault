import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { listArtists, getArtistDetail } from '../services/artistStats';
import { getOrFetchArtistInfo } from '../services/artistInfo';

const router = Router();

router.use(requireAuth);

// GET /api/artists?q=<search> — alphabetical list of every distinct artist in
// the user's library. q, when present, filters server-side (matches artist
// name OR song title) before aggregating — see listArtists for why this is
// backend-driven rather than shipped down for the frontend to filter locally.
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const artists = await listArtists(req.userId!, q);
    res.json({ artists });
  } catch (err) {
    next(err);
  }
});

// GET /api/artists/:key — one artist's synced tracks, listen count, the
// playlists their songs appear in, aggregated genres, and cached (lazily
// fetched on first visit) Last.fm bio/photo.
router.get('/:key', async (req: AuthRequest, res, next) => {
  try {
    const detail = await getArtistDetail(req.userId!, req.params.key);
    if (!detail) {
      res.status(404).json({ error: 'Artist not found' });
      return;
    }
    const info = await getOrFetchArtistInfo(detail.name);
    res.json({
      key: detail.key,
      name: detail.name,
      thumbnailUrl: info?.thumbnailUrl ?? detail.thumbnailUrl,
      bio: info?.bio ?? null,
      songCount: detail.songCount,
      totalPlayCount: detail.totalPlayCount,
      playlists: detail.playlists,
      genres: detail.genres,
      videos: detail.videos,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
