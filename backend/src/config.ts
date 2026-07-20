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
