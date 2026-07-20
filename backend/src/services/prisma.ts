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

// Every call site does `import { prisma } from './prisma'; prisma.user.findMany(...)`
// — a plain `export const prisma = new PrismaClient()` would make that
// binding permanent for the process's lifetime, but switchDatabase() below
// needs to be able to point the app at a different connection at runtime (see
// the admin Postgres-settings save flow). This Proxy forwards every property
// access to whatever `client` currently is, so every one of those call sites
// keeps working unchanged while still picking up a swap immediately. Methods
// are rebound to the client they were read from (not the proxy) so `this`
// resolves correctly inside Prisma's own internals.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Tests a candidate Postgres connection — reachable, and actually this app's
 * own schema rather than an arbitrary/empty database — and only swaps the
 * live connection over to it once both checks pass. Throws a human-readable
 * message on failure; the live client (and everything currently using it) is
 * left completely untouched in that case, which is what makes this safe to
 * call directly from the admin settings save endpoint.
 */
export async function switchDatabase(url: string): Promise<void> {
  const candidate = new PrismaClient({ datasources: { db: { url } } });
  try {
    await candidate.$connect();
    // Every schema this app has ever had includes "users" (its very first
    // migration) — existing and reachable is good evidence this is a real,
    // already-migrated instance of this app, not just any Postgres server.
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
