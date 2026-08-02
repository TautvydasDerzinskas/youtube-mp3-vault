// Fuzzy artist/title/duration matching shared by every "find a better-quality
// file for this track on some external source" flow (see hqReplace.ts for
// Soulseek, jiosaavnReplace.ts for JioSaavn) — kept provider-agnostic so both
// apply the exact same confidence bar rather than each inventing its own.

export function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Folds away diacritics and punctuation on top of normalizeForMatch's
// case/whitespace normalization — lets "Café" match "Cafe" and "Don't Stop"
// match "Dont Stop" (common transliteration/typing differences between how a
// track is tagged locally vs. by an external source) without opening the
// door to genuinely different titles.
export function foldForMatch(s: string): string {
  return normalizeForMatch(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(s: string): Set<string> {
  return new Set(foldForMatch(s).split(' ').filter(Boolean));
}

// Jaccard similarity over word sets — tolerant of reordering, a dropped/added
// filler word ("The", "feat"), or minor spelling variation, without being so
// loose that two titles sharing only a couple of common words would pass.
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// One side containing the other (after folding) tolerates a candidate
// carrying extra featured-artist credits ("Artist ft. Other") that our own
// stored artist doesn't, or vice versa, without accepting an unrelated
// artist that merely shares a short substring.
export function artistIsSupersetMatch(a: string, b: string): boolean {
  const fa = foldForMatch(a);
  const fb = foldForMatch(b);
  if (!fa || !fb) return false;
  return fa === fb || fa.includes(fb) || fb.includes(fa);
}

export type DurationStrictness = 'sanity' | 'moderate' | 'tight';

// How close a candidate's reported length has to be to our stored video
// duration to corroborate a match, in seconds. YouTube video duration can
// legitimately diverge a bit from a track's canonical length (intros,
// trimmed uploads, extended edits), so this is a proximity window, not
// equality — and it's deliberately narrower the looser a tier's text
// comparison already is: an exact artist+title match barely needs duration
// to confirm anything (it's a sanity backstop against, say, a same-titled
// but different recording), whereas the fuzzy-title tier leans on duration
// as real corroborating evidence, not just a backstop.
export function durationToleranceSeconds(videoDurationSec: number, strictness: DurationStrictness): number {
  switch (strictness) {
    case 'sanity': return Math.max(20, videoDurationSec * 0.15);
    case 'moderate': return Math.max(12, videoDurationSec * 0.10);
    case 'tight': return Math.max(8, videoDurationSec * 0.07);
  }
}

// requireKnown=false treats "one or both durations unknown" as non-disqualifying
// (many external sources don't report length, and our own video.duration can
// be null for older rows) — only the fuzzy-title tier, which needs duration to
// carry real weight rather than just sanity-check an already-confident match,
// requires both sides to actually be known.
export function isDurationPlausible(
  candidateSec: number | null,
  videoDurationSec: number | null,
  strictness: DurationStrictness,
  requireKnown: boolean,
): boolean {
  if (candidateSec === null || videoDurationSec === null) return !requireKnown;
  return Math.abs(candidateSec - videoDurationSec) <= durationToleranceSeconds(videoDurationSec, strictness);
}

export interface MatchTier {
  textMatch: (candidateArtist: string, candidateTitle: string, artist: string, title: string) => boolean;
  durationStrictness: DurationStrictness;
  requireKnownDuration: boolean;
  // Minimum bitrate improvement (beyond just "any improvement") required for
  // a candidate at this tier — the looser the text match, the more the
  // eventual replacement needs to be worth the small residual risk of it
  // being a slightly different recording of the same song.
  minBitrateImprovementKbps: number;
}

// Tried in order — the first tier to produce any surviving candidate wins,
// looser tiers are never even evaluated. Deliberately kept as separate
// sequential passes rather than one flattened scoring function, so each
// tier's own bar (text confidence + matching duration tolerance + minimum
// bitrate margin) stays easy to reason about independently.
export const MATCH_TIERS: MatchTier[] = [
  {
    // Exact, case/whitespace-insensitive artist+title match — deliberately
    // not stripped of remix/version/edit wording, so a different mix of the
    // same song never passes as a match.
    textMatch: (ca, ct, a, t) => normalizeForMatch(ca) === normalizeForMatch(a) && normalizeForMatch(ct) === normalizeForMatch(t),
    durationStrictness: 'sanity',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 0,
  },
  {
    // Same, but diacritic/punctuation-folded — catches "Café" vs "Cafe",
    // "Don't" vs "Dont", smart quotes vs straight quotes, etc.
    textMatch: (ca, ct, a, t) => foldForMatch(ca) === foldForMatch(a) && foldForMatch(ct) === foldForMatch(t),
    durationStrictness: 'sanity',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 0,
  },
  {
    // Title still has to match exactly (folded); artist is now allowed to be
    // a superset/subset of ours, tolerating extra featured-artist credits on
    // either side.
    textMatch: (ca, ct, a, t) => artistIsSupersetMatch(ca, a) && foldForMatch(ct) === foldForMatch(t),
    durationStrictness: 'moderate',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 32,
  },
  {
    // Loosest tier: fuzzy token-overlap title similarity plus artist
    // superset tolerance. This is the only tier where duration is required
    // (not just checked when available), since text confidence alone isn't
    // enough to trust an automatic file replacement here.
    textMatch: (ca, ct, a, t) => artistIsSupersetMatch(ca, a) && titleSimilarity(ct, t) >= FUZZY_TITLE_SIMILARITY_THRESHOLD,
    durationStrictness: 'tight',
    requireKnownDuration: true,
    minBitrateImprovementKbps: 32,
  },
];

const FUZZY_TITLE_SIMILARITY_THRESHOLD = 0.82;
