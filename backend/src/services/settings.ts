import { prisma } from './prisma';
import { config } from '../config';

export interface SmtpSettings {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

export interface PostgresSettings {
  database: string;
  user: string;
  password: string;
}

export interface LastfmSettings {
  apiKey: string | null;
  apiSecret: string | null;
}

interface SettingsCache {
  smtp: SmtpSettings;
  postgres: PostgresSettings;
  lastfm: LastfmSettings;
}

let cache: SettingsCache | null = null;

async function ensureRow() {
  const existing = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.appSettings.create({
    data: {
      id: 1,
      smtpHost: config.smtp.host || null,
      smtpPort: config.smtp.port,
      smtpSecure: config.smtp.secure,
      smtpUser: config.smtp.user || null,
      smtpPass: config.smtp.pass || null,
      smtpFrom: config.smtp.from,
      postgresDb: config.postgres.database,
      postgresUser: config.postgres.user,
      postgresPassword: config.postgres.password,
      lastfmApiKey: config.lastfmApiKey || null,
      lastfmApiSecret: config.lastfmApiSecret || null,
    },
  });
}

function toCache(row: Awaited<ReturnType<typeof ensureRow>>): SettingsCache {
  return {
    smtp: {
      host: row.smtpHost, port: row.smtpPort, secure: row.smtpSecure,
      user: row.smtpUser, pass: row.smtpPass, from: row.smtpFrom,
    },
    postgres: { database: row.postgresDb, user: row.postgresUser, password: row.postgresPassword },
    lastfm: { apiKey: row.lastfmApiKey, apiSecret: row.lastfmApiSecret },
  };
}

/** Must run once at startup, before anything else in this module is called. */
export async function loadSettings(): Promise<void> {
  cache = toCache(await ensureRow());
}

function requireCache(): SettingsCache {
  if (!cache) throw new Error('Settings accessed before loadSettings() ran at startup');
  return cache;
}

export function getSmtpSettings(): SmtpSettings {
  return requireCache().smtp;
}

export function isSmtpConfigured(): boolean {
  return requireCache().smtp.host !== null;
}

export function getPostgresSettings(): PostgresSettings {
  return requireCache().postgres;
}

export function getLastfmSettings(): LastfmSettings {
  return requireCache().lastfm;
}

// apiKey alone is enough for the read-only Discover section.
export function isLastfmDiscoverEnabled(): boolean {
  return requireCache().lastfm.apiKey !== null;
}

export function isLastfmScrobblingConfigured(): boolean {
  const { apiKey, apiSecret } = requireCache().lastfm;
  return apiKey !== null && apiSecret !== null;
}

export async function updateSmtpSettings(input: SmtpSettings): Promise<SmtpSettings> {
  const row = await prisma.appSettings.update({
    where: { id: 1 },
    data: {
      smtpHost: input.host || null,
      smtpPort: input.port,
      smtpSecure: input.secure,
      smtpUser: input.user || null,
      smtpPass: input.pass || null,
      smtpFrom: input.from,
    },
  });
  cache = toCache(row);
  return cache.smtp;
}

export async function persistPostgresSettings(input: PostgresSettings): Promise<void> {
  const row = await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      postgresDb: input.database,
      postgresUser: input.user,
      postgresPassword: input.password,
    },
    update: {
      postgresDb: input.database,
      postgresUser: input.user,
      postgresPassword: input.password,
    },
  });
  cache = toCache(row);
}

export async function updateLastfmSettings(input: LastfmSettings): Promise<LastfmSettings> {
  const row = await prisma.appSettings.update({
    where: { id: 1 },
    data: {
      lastfmApiKey: input.apiKey || null,
      lastfmApiSecret: input.apiSecret || null,
    },
  });
  cache = toCache(row);
  return cache.lastfm;
}
