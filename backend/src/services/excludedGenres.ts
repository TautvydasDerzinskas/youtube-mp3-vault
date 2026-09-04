import { normalizeKey } from './textNormalization';

// Genres dropped from a track's stored `genres` outright, regardless of
// what the audio-analysis model returns — currently just "Electronic",
// too broad a Discogs400 parent genre to be useful on its own (nearly every
// dance/pop-adjacent track scores highly on it) and, sorting alphabetically
// first, it crowded out far more specific/useful subgenres in every
// genre-based UI (track rows, the Genres page, genre filtering). Matched
// via normalizeKey, same trim+lowercase every other genre comparison in the
// app uses. Mirrors audio-analysis/app.py's own EXCLUDED_PARENT_GENRES,
// which stops new analyses from producing it in the first place — this is
// the same exclusion applied again on the Node side, so it also covers
// results from an audio-analysis service that hasn't been rebuilt yet.
const EXCLUDED_GENRES = new Set(['electronic']);

export function stripExcludedGenres(genres: string[]): string[] {
  return genres.filter((g) => !EXCLUDED_GENRES.has(normalizeKey(g)));
}
