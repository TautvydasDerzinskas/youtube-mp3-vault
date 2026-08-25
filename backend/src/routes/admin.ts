import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { prisma, switchDatabase, buildDatabaseUrl } from '../services/prisma';
import { withDownloadStats } from '../services/playlistStats';
import { startSoftReimport, startTagRebuild } from '../services/reimport';
import { startOriginalTitleBackfill } from '../services/originalTitleBackfill';
import { toCsv, parseCsv } from '../services/csv';
import {
  getSmtpSettings, updateSmtpSettings, getPostgresSettings, persistPostgresSettings, SmtpSettings,
  getLastfmSettings, updateLastfmSettings,
  getHqSettings, updateHqSettings, HQ_USER_PROVIDERS, HqUserProvider,
} from '../services/settings';

const router = Router();

router.use(requireAuth, requireAdmin);

const USER_LIST_SELECT = {
  id: true,
  email: true,
  displayName: true,
  language: true,
  emailVerified: true,
  isAdmin: true,
  isBanned: true,
  scrobblingEnabled: true,
  createdAt: true,
} as const;

// GET /api/admin/users
router.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { ...USER_LIST_SELECT, _count: { select: { playlists: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      users: users.map(({ _count, ...u }) => ({ ...u, playlistCount: _count.playlists })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_LIST_SELECT,
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const playlists = await prisma.playlist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const enrichedPlaylists = await withDownloadStats(playlists);

    res.json({ user, playlists: enrichedPlaylists });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/ban
router.post('/users/:id/ban', async (req: AuthRequest, res, next) => {
  try {
    if (req.params.id === req.userId) {
      res.status(400).json({ error: 'You cannot ban your own account' });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (existing.isAdmin) {
      res.status(400).json({ error: 'You cannot ban an admin account' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: true },
      select: USER_LIST_SELECT,
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/unban
router.post('/users/:id/unban', async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: false },
      select: USER_LIST_SELECT,
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/playlists/:id/soft-reimport
// Re-runs title normalization, MusicBrainz (re)matching, and audio analysis
// for every video in the playlist using files already downloaded — skips
// the mp3 download step entirely. See services/reimport.ts.
router.post('/playlists/:id/soft-reimport', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    if (!startSoftReimport(playlist.id)) {
      res.status(409).json({ error: 'Playlist is already syncing' });
      return;
    }

    res.json({ started: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/playlists/:id/rebuild-tags
// Re-writes ID3 tags for every already-downloaded video in the playlist
// from its current DB metadata — no network activity, no re-download, no
// metadata/audio-analysis rework. See services/reimport.ts's startTagRebuild.
router.post('/playlists/:id/rebuild-tags', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    if (!startTagRebuild(playlist.id)) {
      res.status(409).json({ error: 'Playlist is already syncing' });
      return;
    }

    res.json({ started: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/backfill-original-titles
// Global (not per-playlist) — re-fetches the raw YouTube title for every
// PlaylistVideo row whose originalTitle was never populated, via a
// metadata-only yt-dlp call per video. See services/originalTitleBackfill.ts.
router.post('/backfill-original-titles', async (_req, res, next) => {
  try {
    if (!startOriginalTitleBackfill()) {
      res.status(409).json({ error: 'A backfill is already in progress' });
      return;
    }
    res.json({ started: true });
  } catch (err) {
    next(err);
  }
});

const TRACK_CSV_HEADER = ['youtubeId', 'originalTitle', 'artist', 'title'];

// GET /api/admin/tracks/export?onlyNonHq=true
// Exports every distinct video (across every user's playlists) as a CSV
// meant for round-tripping through an external tool (e.g. an AI cleanup
// pass) and back through the import route below — see that route's own
// comment for the full workflow this pair supports.
router.get('/tracks/export', async (req, res, next) => {
  try {
    const onlyNonHq = req.query.onlyNonHq === 'true';
    const videos = await prisma.playlistVideo.findMany({
      where: onlyNonHq ? { hqFileDownloaded: false } : undefined,
      select: { youtubeId: true, originalTitle: true, artist: true, title: true },
      orderBy: { addedAt: 'desc' },
    });

    // The same YouTube video can be saved into more than one playlist (by
    // the same or different users) — dedupe by youtubeId so a shared video
    // isn't paid for twice by whatever's parsing this CSV downstream. Import
    // below applies its update to every row sharing a youtubeId regardless,
    // so deduping here loses nothing.
    const seen = new Map<string, { originalTitle: string | null; artist: string | null; title: string }>();
    for (const v of videos) {
      if (!seen.has(v.youtubeId)) seen.set(v.youtubeId, v);
    }

    const rows = [TRACK_CSV_HEADER, ...[...seen.entries()].map(([youtubeId, v]) => [
      youtubeId, v.originalTitle ?? '', v.artist ?? '', v.title,
    ])];

    const filename = `tracks-export${onlyNonHq ? '-non-hq' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(toCsv(rows));
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/tracks/import  { csv: string }
// The other half of the export above: re-imports a (possibly externally
// edited) copy of that CSV and applies its artist/title columns back onto
// every video matching each row's youtubeId. Built for correcting videos
// whose artist/title were extracted badly from a messy YouTube title (so
// the HQ scan's search never finds a match) — export the non-HQ tracks, run
// them through an external AI/manual pass, re-import the corrected CSV.
// originalTitle is read back but never applied — it's only there so
// whatever tool edits the CSV has the raw title as context.
router.post('/tracks/import', async (req, res, next) => {
  try {
    const { csv } = req.body as { csv?: unknown };
    if (typeof csv !== 'string' || !csv.trim()) {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    const rows = parseCsv(csv);
    if (rows.length === 0) {
      res.status(400).json({ error: 'CSV file is empty' });
      return;
    }

    const header = rows[0].map(h => h.trim().toLowerCase());
    const youtubeIdIdx = header.indexOf('youtubeid');
    const artistIdx = header.indexOf('artist');
    const titleIdx = header.indexOf('title');
    if (youtubeIdIdx === -1 || titleIdx === -1) {
      res.status(400).json({ error: 'CSV must have "youtubeId" and "title" columns' });
      return;
    }

    let updated = 0;
    let skipped = 0;
    const notFound: string[] = [];

    for (const row of rows.slice(1)) {
      const youtubeId = row[youtubeIdIdx]?.trim();
      const title = row[titleIdx]?.trim();
      // A blank artist/title cell means "no correction for this field", not
      // "clear it" — the caller only wants to apply what the CSV actually
      // fills in, never blank out a field that already has a real value.
      const artist = artistIdx !== -1 ? row[artistIdx]?.trim() : '';

      if (!youtubeId || !title) {
        skipped++;
        continue;
      }

      const data: Prisma.PlaylistVideoUpdateManyMutationInput = {
        title,
        // Corrected metadata is worthless until the next HQ scan actually
        // uses it — 'checked' from a past (bad-query) pass would otherwise
        // never get retried on its own.
        qualityCheckStatus: 'pending',
        qualityCheckedAt: null,
      };
      if (artist) data.artist = artist;

      const result = await prisma.playlistVideo.updateMany({ where: { youtubeId }, data });
      if (result.count === 0) notFound.push(youtubeId);
      else updated += result.count;
    }

    res.json({ updated, skipped, notFound });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/logs?userId=&from=&to=
router.get('/logs', async (req, res, next) => {
  try {
    const { userId, from, to } = req.query as Record<string, string | undefined>;

    const where: Prisma.LogWhereInput = {};
    if (userId) where.userId = userId;

    if (from || to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          res.status(400).json({ error: 'Invalid "from" date' });
          return;
        }
        createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          res.status(400).json({ error: 'Invalid "to" date' });
          return;
        }
        createdAt.lte = toDate;
      }
      where.createdAt = createdAt;
    }

    const logs = await prisma.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, email: true } } },
    });

    res.json({
      logs: logs.map(({ user, ...log }) => ({
        ...log,
        userDisplayName: user.displayName,
        userEmail: user.email,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/settings', async (_req, res, next) => {
  try {
    res.json({
      smtp: getSmtpSettings(), postgres: getPostgresSettings(), lastfm: getLastfmSettings(),
      hq: getHqSettings(),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings/smtp', async (req, res, next) => {
  try {
    const { host, port, secure, user, pass, from } = req.body as Record<string, unknown>;

    const trimmedHost = typeof host === 'string' ? host.trim() : '';
    const parsedPort = Number(port);
    if (trimmedHost && (!Number.isFinite(parsedPort) || parsedPort <= 0)) {
      res.status(400).json({ error: 'A valid SMTP port is required when a host is set' });
      return;
    }

    const input: SmtpSettings = {
      host: trimmedHost || null,
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587,
      secure: secure === true,
      user: typeof user === 'string' && user.trim() ? user.trim() : null,
      pass: typeof pass === 'string' && pass ? pass : null,
      from: typeof from === 'string' && from.trim() ? from.trim() : 'YoutubeVault <no-reply@localhost>',
    };

    const updated = await updateSmtpSettings(input);
    res.json({ smtp: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/postgres', async (req, res, next) => {
  try {
    const { database, user, password } = req.body as Record<string, unknown>;
    if (
      typeof database !== 'string' || !database.trim() ||
      typeof user !== 'string' || !user.trim() ||
      typeof password !== 'string' || !password
    ) {
      res.status(400).json({ error: 'Database, user, and password are all required' });
      return;
    }

    const candidate = { database: database.trim(), user: user.trim(), password };

    try {
      await switchDatabase(buildDatabaseUrl(candidate));
    } catch (err: any) {
      res.status(422).json({ error: err.message });
      return;
    }

    await persistPostgresSettings(candidate);
    res.json({ postgres: getPostgresSettings() });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings/lastfm', async (req, res, next) => {
  try {
    const { apiKey, apiSecret } = req.body as Record<string, unknown>;
    const updated = await updateLastfmSettings({
      apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null,
      apiSecret: typeof apiSecret === 'string' && apiSecret.trim() ? apiSecret.trim() : null,
    });
    res.json({ lastfm: updated });
  } catch (err) {
    next(err);
  }
});

router.patch('/settings/hq', async (req, res, next) => {
  try {
    const { autoDownloadEnabled, allowedUserProviders } = req.body as Record<string, unknown>;
    // Sanitized against the canonical whitelist rather than trusted as-is —
    // a stale/mismatched client sending an unknown provider key should
    // never be able to persist it (see services/settings.ts).
    const sanitizedProviders = Array.isArray(allowedUserProviders)
      ? allowedUserProviders.filter((p): p is HqUserProvider => HQ_USER_PROVIDERS.includes(p))
      : [];
    const updated = await updateHqSettings({
      autoDownloadEnabled: autoDownloadEnabled === true,
      allowedUserProviders: sanitizedProviders,
    });
    res.json({ hq: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
