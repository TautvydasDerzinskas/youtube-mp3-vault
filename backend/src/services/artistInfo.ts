import { prisma } from './prisma';
import { normalizeKey } from './textNormalization';
import { getArtistInfo as fetchFromLastfm } from './lastfm';
import { isLastfmDiscoverEnabled } from './settings';
import { isOnline } from './connectivity';

export interface CachedArtistInfo {
  bio: string | null;
  thumbnailUrl: string | null;
}

// Fetch-once-then-cache-forever: the first visit to an artist's page (while
// online, with Last.fm configured) fetches and persists whatever Last.fm
// has; every visit after that — online or not — is served straight from
// this table, so the page keeps working once it's been seen at least once.
// fetchedAt is set even on a "nothing found" result, so a permanently
// bio-less artist doesn't get re-fetched on every single visit.
export async function getOrFetchArtistInfo(displayName: string): Promise<CachedArtistInfo | null> {
  const normalizedName = normalizeKey(displayName);

  const existing = await prisma.artistInfo.findUnique({ where: { normalizedName } });
  if (existing?.fetchedAt) {
    return { bio: existing.bio, thumbnailUrl: existing.thumbnailUrl };
  }

  // Nothing cached yet, and no way to actually attempt a fetch right now —
  // return without writing a row, so a later request (once online/configured)
  // still gets a real attempt instead of being stuck on an unset fetchedAt forever.
  if (!isOnline() || !isLastfmDiscoverEnabled()) {
    return existing ? { bio: existing.bio, thumbnailUrl: existing.thumbnailUrl } : null;
  }

  const fetched = await fetchFromLastfm(displayName);

  await prisma.artistInfo.upsert({
    where: { normalizedName },
    create: {
      normalizedName,
      name: displayName,
      bio: fetched?.bio ?? null,
      thumbnailUrl: fetched?.thumbnailUrl ?? null,
      fetchedAt: new Date(),
    },
    update: {
      bio: fetched?.bio ?? null,
      thumbnailUrl: fetched?.thumbnailUrl ?? null,
      fetchedAt: new Date(),
    },
  });

  return fetched;
}
