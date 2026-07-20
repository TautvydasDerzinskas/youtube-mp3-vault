import 'dotenv/config';

// The backend only ever receives the single, already-composed DATABASE_URL
// (docker-compose builds it from POSTGRES_DB/USER/PASSWORD for the sibling
// `db` service — those three env vars themselves aren't passed to this
// container). Parsed here once so services/settings.ts can seed the
// database/user/password fields of the admin-editable AppSettings row from
// whatever's live right now, and so services/prisma.ts's switchDatabase()
// can rebuild a full connection string from just those three fields without
// needing to know (or let an admin change) the host/port.
function parseDatabaseUrl(raw: string): { database: string; user: string; password: string } {
  const url = new URL(raw);
  return {
    database: url.pathname.replace(/^\//, ''),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

const databaseUrl = process.env.DATABASE_URL || '';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  // Separate from NODE_ENV (which several libraries key their own behavior off of) so
  // "staging" can exist as its own deployment tier. Anything other than 'dev' is treated
  // as a real environment — e.g. the demo account is only ever seeded when this is 'dev'.
  appEnv: (process.env.APP_ENV || 'dev').toLowerCase(),
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-use-a-long-random-string',
  jwtExpiresIn: '7d' as const,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost',
  cookieMaxAge: 7 * 24 * 60 * 60 * 1000,
  isProduction: process.env.NODE_ENV === 'production',
  musicDir: process.env.MUSIC_DIR || '/data',
  postgres: {
    url: databaseUrl,
    ...parseDatabaseUrl(databaseUrl),
  },
  // Local Essentia audio-analysis service (see /audio-analysis) — genre
  // classification, works fully offline, no isOnline() gating needed.
  audioAnalysisUrl: process.env.AUDIO_ANALYSIS_URL || 'http://localhost:8000',
  // Both from the same free registration at https://www.last.fm/api/account/create.
  // Only ever used to *seed* AppSettings on a fresh database (see
  // services/settings.ts) — both are admin-editable from then on, same
  // treatment as SMTP/Postgres below. apiKey alone covers the read-only
  // "Discover" section; apiSecret is additionally needed for a user to
  // connect+scrobble (see services/lastfm.ts's signed requests).
  lastfmApiKey: process.env.LASTFM_API_KEY || '',
  lastfmApiSecret: process.env.LASTFM_API_SECRET || '',
  // Whichever email registers with this address is marked admin at creation time.
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'YoutubeVault <no-reply@localhost>',
  },
};
