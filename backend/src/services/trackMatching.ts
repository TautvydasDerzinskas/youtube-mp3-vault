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

const FEAT_KEYWORD_RE = /\b(feat\.?|ft\.?|featuring)\b/i;
// Everything up to the feat keyword, within one bracket's content — captures
// e.g. "Extended Remix, " out of "Extended Remix, feat. Droid Project", so
// that other info sharing the bracket with a feat credit survives instead of
// the whole bracket being dropped. Assumes a feat credit runs to the end of
// whatever bracket it's in (true of every real-world case seen so far,
// including multiple comma-separated featured artists like
// "feat. Slimus, Ай-Q") rather than trying to parse content that resumes
// *after* the credit, which would need distinguishing "another feature" from
// "an unrelated descriptor" past a comma — not worth the complexity without
// a real example of that ordering.
const FEAT_PREFIX_RE = /^(.*?)\b(?:feat\.?|ft\.?|featuring)\b.*$/i;
// A bare (non-bracketed) "feat./ft./featuring <names>" run, consumed from
// the keyword up to the next bracket-open or the end of the string — covers
// "Title Feat. Artist" and "Artist feat. Other Artist" (an artist field with
// no title at all), which the bracket handling below doesn't touch.
const BARE_FEAT_RE = /\s*\b(feat\.?|ft\.?|featuring)\b[^([\]]*(?=[([]|$)/gi;

// Strips featured-artist credits from a title or artist string — used to
// retry a provider search with a plainer query when the original (which
// tier-matching in MATCH_TIERS already tolerates a *found* candidate
// differing on, see artistIsSupersetMatch/titleSimilarity above) turns up no
// candidates at all. That's a distinct problem from matching: a provider's
// own search endpoint may simply rank/return worse results for a query
// cluttered with "(feat. X)", so nothing ever reaches the tolerant matching
// tiers to begin with. Returns the original string unchanged if nothing was
// stripped (including when stripping would empty it out) — the caller
// should compare against the original before deciding a retry is worthwhile.
export function stripFeaturedArtists(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/([([])([^)\]]*)([)\]])/g, (whole, open, inner, close) => {
    if (!FEAT_KEYWORD_RE.test(inner)) return whole; // no feat credit in this bracket — leave it alone
    const before = (inner.match(FEAT_PREFIX_RE)?.[1] ?? '').replace(/[,;\s]+$/, '').trim();
    // Nothing else shared the bracket (the common case, "(feat. X)") — drop
    // the whole thing, delimiters included, rather than leaving "()" behind.
    return before ? `${open}${before}${close}` : ' ';
  });
  cleaned = cleaned.replace(BARE_FEAT_RE, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || text.trim();
}

// Upload-decoration words/phrases — "[PREMIERE]", "- Lyrics HD!", "(FREE)",
// "- High Quality", "[Bass Boosted]", a "(Live - ...)" performance-context
// bracket — that clutter a query without being real catalog information.
// Deliberately a narrower, standalone list rather than reusing
// musicbrainz.ts's stripJunkTags: that function's second pass drops *any*
// bracket that isn't on its remix/edit/version allowlist, which is fine for
// metadata resolution (MusicBrainz's own fuzzy search absorbs the loss) but
// actively wrong here — it was gutting real title content like "(Interlude)"
// and "(Bring Your Own Bombs)" that simply isn't a recognized version word.
// This only ever removes a *recognized* junk phrase; anything unfamiliar is
// left alone, however odd-looking, since guessing wrong here costs a real
// search match. "live" is deliberately included even though
// MEANINGFUL_BRACKET_WORDS in musicbrainz.ts keeps it for metadata (a live
// recording genuinely is a different one there) — a specific live/TV-
// performance clip essentially never has its own dedicated HQ release, so
// falling back to matching the studio version is the more useful bet here.
//
// Deliberately does NOT include "slowed"/"reverb"/"tiktok" despite being a
// real, recurring pattern (a TikTok-trend edit like "(Tiktok Slowed +
// Reverb)") — unlike "live", that's not the same song at a quality
// disadvantage, it's the same song deliberately played at a different tempo/
// pitch. Falling back to the plain title would find and auto-replace it with
// a normal-speed file, silently swapping what the user actually kept rather
// than upgrading it. MATCH_TIERS' duration check isn't a reliable enough
// backstop either — reverb alone doesn't shift duration at all, only an
// actual tempo change does, so a reverb-only edit would sail through
// unnoticed.
const UPLOAD_NOISE_WORDS = [
  'official', 'video', 'audio', 'lyrics?', 'visualizer', 'remaster\\w*',
  'hd', 'hq', '4k', 'high\\s*quality', 'premiere', 'live', 'eurovision', 'trailer',
  'free', 'bass\\s*boosted', 'out\\s*now', 'cover\\s*art', 'explicit', 'clean',
  'download\\s*link', 'radio\\s*rip', 'copyright\\s*free(\\s*music)?', 'english\\s*version',
  // A producer credit — "(Prod. X)" — is exactly as unhelpful to a provider's
  // own search as a feat. credit (see stripFeaturedArtists), so gets the same
  // treatment. Every real case seen so far is the bracket's entire content
  // ("(Prod. Jonah Roy)"), never sharing it with something else worth
  // keeping, so unlike feat this doesn't need the before/after split.
  'prod\\.?',
  // Non-English uploader-tag spellings of official/audio/clip/premiere — same
  // rationale, and same specific languages, as musicbrainz.ts's own
  // JUNK_TAG_WORDS (this app's userbase evidently spans Portuguese/Spanish
  // "Áudio Oficial" and Russian/Lithuanian uploads too, not just English ones).
  'oficial', 'áudio', 'клип', 'официальн\\w*', 'премьера\\w*', 'oficialus', 'klipas',
];
// \b and \w are ASCII-only in JS by default — the Cyrillic entries above
// (клип/официальн*/премьера*) never actually matched anything with a plain
// \b(...)​\b pattern, silently no-oping on every Cyrillic title. Unicode
// property escapes (\p{L}/\p{N} under the 'u' flag) treat any Unicode
// letter/number as a "word" character, so the boundary lands correctly
// regardless of script — verified this actually matches "Официальный" now,
// where the old pattern didn't.
const UPLOAD_NOISE_WORD_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${UPLOAD_NOISE_WORDS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
// Trailing punctuation after the noise word is tolerant of a stray "!"/"?"/
// "." ("- Lyrics Hd!"), not just whitespace — an upload title's trailing
// flourish is exactly where that shows up.
const UPLOAD_NOISE_TRAILING_RE = new RegExp(
  `[\\s\\-|/,*•]+(?<![\\p{L}\\p{N}])(${UPLOAD_NOISE_WORDS.join('|')})(?![\\p{L}\\p{N}])[\\s!?.]*$`, 'iu'
);

// Eurovision participant countries, past and present — the contest's own
// YouTube channel tags every entry with "(Song Title (Country))", a channel
// convention rather than part of the actual song title (e.g. "Sweet People
// (Ukraine)"). Matched only as a bracket's WHOLE (trimmed) content, never
// "contains" like UPLOAD_NOISE_WORDS above — a country name can legitimately
// be one word among others (a producer credit like "(Chad Remix)", or an
// artist name like "(Georgia Anne Muldrow Remix)"), and only an exact,
// nothing-else match is a safe enough signal to drop the bracket. A bare
// "eurovision" mention (e.g. "(Eurovision 2016 - Latvia)") is already caught
// by the ordinary contains-based check above via UPLOAD_NOISE_WORDS.
const EUROVISION_COUNTRIES = [
  'Albania', 'Andorra', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Belarus', 'Belgium',
  'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Czech Republic',
  'Denmark', 'Estonia', 'Finland', 'France', 'Georgia', 'Germany', 'Greece', 'Hungary',
  'Iceland', 'Ireland', 'Israel', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta',
  'Moldova', 'Monaco', 'Montenegro', 'Morocco', 'Netherlands', 'North Macedonia', 'Norway',
  'Poland', 'Portugal', 'Romania', 'Russia', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia',
  'Spain', 'Sweden', 'Switzerland', 'Turkey', 'Ukraine', 'United Kingdom',
];
const COUNTRY_ONLY_BRACKET_RE = new RegExp(`^(${EUROVISION_COUNTRIES.join('|')})$`, 'i');

// A bracket whose entire (trimmed) content is a plausible bare release year
// — "Song Title (2015)", "Song Title [2013]" — same exact-whole-content
// reasoning as COUNTRY_ONLY_BRACKET_RE above: a real title bracket is never
// *just* a 4-digit number with nothing else, so this is safe as a "contains"
// check would not be (a track's title could legitimately contain a year
// among other words). Range is deliberately generous (1950–2049) rather than
// tied to "now" — this only needs to reject things that aren't years at all,
// not police plausible release dates.
const YEAR_ONLY_BRACKET_RE = /^(19[5-9]\d|20[0-4]\d)$/;

// Label/imprint release tags — "[Monstercat Release]", "[Silk Music]",
// "(Proximity Release)" — a bracket ending in Music/Records/Release, but
// ONLY when nothing meaningful (remix/mix/edit/version/etc, same word list
// as musicbrainz.ts's MEANINGFUL_BRACKET_WORDS) shares the bracket, via
// negative lookahead. A first attempt at this without that guard wrongly
// nuked "[Remix Music]" down to nothing, losing the real "Remix" info — the
// guard means that case simply doesn't match at all now (falls through
// untouched), while genuine label tags like the real examples above still do.
const MEANINGFUL_VERSION_WORDS = 'mix|remix|edit|version|vip|bootleg|mashup|cover|instrumental|acoustic'
  + '|unplugged|medley|rework|flip|dub|extended|radio|club|original|edition|chorus|reprise|refix|redux|bonus|demo';
const LABEL_TAG_BRACKET_RE = new RegExp(
  `^(?!.*\\b(?:${MEANINGFUL_VERSION_WORDS})\\b).*\\b(?:music|records?|recordings?|release)\\s*$`, 'i'
);

// Words that mean the audio itself was deliberately altered — a different
// tempo/pitch, not just a different quality of the same recording. A hard
// override, checked before anything else below: even if a bracket ALSO
// contains an otherwise-safe noise word ("(Slowed & Bass Boosted)" contains
// both "slowed" and the already-approved "bass boosted"), the presence of
// any of these blocks stripping that bracket at all. Silently falling back
// to a plain-title search here would find and auto-replace the file with a
// normal-speed version — not a quality upgrade, a content swap the user
// never asked for. MATCH_TIERS' duration check isn't a reliable backstop
// either: reverb alone doesn't shift duration, only an actual tempo change
// does, so a reverb-only edit would sail through unnoticed.
const CONTENT_ALTERED_WORDS = 'slowed|reverb|sped\\s*up|nightcore|daycore|chopped\\s*(?:and|&)\\s*screwed';
const CONTENT_ALTERED_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${CONTENT_ALTERED_WORDS})(?![\\p{L}\\p{N}])`, 'iu');

// Strips upload-decoration noise — see UPLOAD_NOISE_WORDS/EUROVISION_COUNTRIES/
// YEAR_ONLY_BRACKET_RE/LABEL_TAG_BRACKET_RE above. A bracket containing a
// recognized noise word, or whose entire content is nothing but a country
// name, a bare year, or a guarded label tag, is dropped in its entirety (no
// attempt to keep other content sharing it, unlike stripFeaturedArtists —
// none of the real cases seen so far mix noise with something worth keeping
// in the same bracket) — UNLESS CONTENT_ALTERED_RE also matches, which wins
// outright regardless of what else is in there; a bare trailing noise phrase
// is trimmed off the end. Same "returns the original if nothing changed"
// contract as stripFeaturedArtists, for the same reason (the caller only
// wants to retry a search when this actually produced something different).
export function stripUploadNoise(text: string): string {
  if (!text) return text;
  // Same [{【 / ]}】 → ( / ) normalization as musicbrainz.ts's stripJunkTags —
  // YouTube titles use them interchangeably for the same kind of annotation.
  let cleaned = text.replace(/[[{【]/g, '(').replace(/[\]}】]/g, ')');
  cleaned = cleaned.replace(/([([])([^)\]]*)([)\]])/g, (whole, _open, inner) => {
    if (CONTENT_ALTERED_RE.test(inner)) return whole;
    const trimmed = inner.trim();
    return UPLOAD_NOISE_WORD_RE.test(inner)
      || COUNTRY_ONLY_BRACKET_RE.test(trimmed)
      || YEAR_ONLY_BRACKET_RE.test(trimmed)
      || LABEL_TAG_BRACKET_RE.test(trimmed)
      ? ' '
      : whole;
  });
  for (let i = 0; i < 10; i++) {
    const next = cleaned.replace(UPLOAD_NOISE_TRAILING_RE, '').trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || text.trim();
}

// Decorative Unicode a video's uploader-chosen title/channel name often
// carries (flag pairs, stars, dingbats, misc pictographs) — essentially
// never part of a real catalog entry on any provider searched here, unlike a
// feat. credit above (which some catalogs genuinely do index), so this is
// applied unconditionally before every search rather than only as a
// no-results fallback. Replaces with a space rather than deleting outright,
// since these are frequently glued directly onto a word with no separating
// whitespace (e.g. "🇧🇷Dj Alok") and simply deleting the symbol would fuse
// the surrounding text together wrong. Deliberately excludes the zero-width
// joiner/variation-selector code points compound emoji use to glue simpler
// ones together (a linter footgun in a character class, and — being
// zero-width — harmless to leave behind either way): every base emoji
// codepoint they'd join is already covered by the ranges below, so a stray
// joiner left behind is invisible, not clutter.
const DECORATIVE_SYMBOL_RE =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

export function stripDecorativeSymbols(text: string): string {
  if (!text) return text;
  const cleaned = text.replace(DECORATIVE_SYMBOL_RE, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || text;
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
