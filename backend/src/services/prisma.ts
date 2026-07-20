import { PrismaClient } from '@prisma/client';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

let client: PrismaClient = global.__prismaClient ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  global.__prismaClient = client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function switchDatabase(url: string): Promise<void> {
  const candidate = new PrismaClient({ datasources: { db: { url } } });
  try {
    await candidate.$connect();
    await candidate.$queryRawUnsafe('SELECT 1 FROM "users" LIMIT 1');
  } catch (err: any) {
    await candidate.$disconnect().catch(() => {});
    const message: string = err?.message ?? '';
    if (/password authentication failed|role .* does not exist/i.test(message)) {
      throw new Error('Authentication failed — check the username and password');
    }
    if (/database .* does not exist/i.test(message)) {
      throw new Error('That database does not exist');
    }
    if (/relation "users" does not exist/i.test(message)) {
      throw new Error('Connected, but that database has no YoutubeVault tables — point this at an already-migrated instance, not an empty database');
    }
    throw new Error('Could not connect to that database — check the values and try again');
  }

  const old = client;
  client = candidate;
  if (process.env.NODE_ENV !== 'production') global.__prismaClient = client;
  await old.$disconnect().catch(() => {});
}

/** Rebuilds a full connection string from the live host/port with a new database/user/password. */
export function buildDatabaseUrl(overrides: { database: string; user: string; password: string }): string {
  const url = new URL(config.postgres.url);
  url.pathname = `/${overrides.database}`;
  url.username = overrides.user;
  url.password = overrides.password;
  return url.toString();
}
