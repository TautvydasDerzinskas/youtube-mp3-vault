import 'dotenv/config';

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
  lastfmApiKey: process.env.LASTFM_API_KEY || '',
  lastfmApiSecret: process.env.LASTFM_API_SECRET || '',
  // Optional slskd (Soulseek daemon) instance — see services/slskd.ts. Empty
  // api key means the better-quality check is silently skipped, same as an
  // unconfigured Last.fm key disables Discover. The URL default assumes a
  // bare local dev run against a docker-compose-run slskd (published on
  // localhost:5030) — docker-compose itself overrides this to the
  // container's internal hostname (http://slskd:5030) for the backend
  // container, same pattern as audioAnalysisUrl below.
  slskdUrl: process.env.SLSKD_URL || 'http://localhost:5030',
  slskdApiKey: process.env.SLSKD_API_KEY || '',
  // Headless Chromium binary used only by services/qobuz/session.ts to
  // complete the Qobuz HQ fallback's one-time community verification
  // (a real JS challenge page, not a plain HTTP redirect — see that file).
  // Set by the Dockerfile (Alpine's own chromium package, not Playwright's
  // bundled one — that's glibc-only and won't run on this musl image);
  // undefined in a bare local dev run just means that one feature no-ops
  // until a real Chromium path is provided.
  qobuzChromiumPath: process.env.QOBUZ_CHROMIUM_PATH || '',
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
