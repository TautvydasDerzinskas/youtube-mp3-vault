import { normalizeKey } from './textNormalization';

// Genres the "auto-delete non-music" user preference treats as "not real
// music" — the original spoken-word/ASMR/sound-effects Non-Music catch-all,
// plus full-length spoken audiobooks and pure noise/ambience tracks. Also
// used unconditionally (regardless of that preference) by the generated-
// playlist quality filter — see audioAnalysisWorker.ts. Matched via
// normalizeKey, the same trim+lowercase the /all-tracks genre filter uses,
// so this lines up with what genres=non-music,audiobook,noise shows there.
const AUTO_DELETE_GENRES = new Set(['non-music', 'audiobook', 'noise']);

/** The first of `genres` that matches an auto-delete genre, or null if none do. */
export function matchingAutoDeleteGenre(genres: string[]): string | null {
  return genres.find((g) => AUTO_DELETE_GENRES.has(normalizeKey(g))) ?? null;
}
