import 'dotenv/config';

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
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'MusicVault <no-reply@localhost>',
  },
};
