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

// foldForMatch's stripping regex is ASCII-only, so a string written entirely
// in a non-Latin script (Cyrillic, Greek, CJK, Arabic, Hebrew, etc.) folds
// down to "" - nothing survives. Comparing folded strings with plain `===`
// then means ANY two such strings "match" trivially ("" === ""), regardless
// of how unrelated they actually are - verified real case: a Cyrillic track
// title fold-matched a completely unrelated Cyrillic title this way, false-
// positiving a Tidal HQ replace onto the wrong song. Used wherever a
// fold-based equality check feeds MATCH_TIERS below, so a script that
// entirely disappears under folding can never satisfy those tiers via this
// artifact - it just falls through to a stricter/looser tier instead (tier 1
// still catches an exact, unfolded match; the fuzzy tier's own token-overlap
// check already returns 0 on an empty set, see titleSimilarity above).
function foldsEqualNonEmpty(a: string, b: string): boolean {
  const fa = foldForMatch(a);
  const fb = foldForMatch(b);
  return fa !== '' && fa === fb;
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

// Splits an artist credit into its individual named performers — comma,
// "&"/" x " (via normalizeArtistSeparators), and "feat./ft./featuring" all
// count as a delimiter between separate people. Each resulting token is
// folded as a whole unit rather than merged into one space-joined string, so
// artistIsSupersetMatch below can tell "an extra collaborator was added"
// (a whole extra token) apart from "this is just a word-prefix collision
// inside one person's own multi-word name" (e.g. "Moon" is not a token of
// "Moon Squid" even though foldForMatch's flattened string would contain it
// as a raw substring).
const ARTIST_LIST_SPLIT_RE = /\s*,\s*|\s+(?:feat\.?|ft\.?|featuring)\s+/gi;

function artistNameTokens(s: string): string[] {
  return normalizeArtistSeparators(s)
    .split(ARTIST_LIST_SPLIT_RE)
    .map(foldForMatch)
    .filter(Boolean);
}

// One side's artist list containing the other's (as whole names, not raw
// substrings) tolerates a candidate carrying extra featured-artist credits
// ("Artist ft. Other") that our own stored artist doesn't, or vice versa,
// without accepting an unrelated artist that merely shares a short
// substring (see artistNameTokens above for why token-level comparison,
// not string-level, is what actually enforces that).
export function artistIsSupersetMatch(a: string, b: string): boolean {
  const ta = artistNameTokens(a);
  const tb = artistNameTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [smaller, larger] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return smaller.every((name) => larger.includes(name));
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

// A multi-artist collab credit written with a stylistic connector —
// "Leon Somov x Saulės Kliošas", "Leon Somov & Saulės Kliošas" — rather
// than the comma-separated form most providers actually catalog artist
// credits under ("Leon Somov, Saulės Kliošas"). Global, so a 3+-way collab
// ("A x B x C") normalizes fully too. "x" is deliberately matched
// lowercase-only (no 'i' flag) — a bare uppercase "X" is far more likely to
// be part of a real word/name than a collab marker, whereas lowercase " x "
// standalone between two names is essentially always this convention in
// practice. "&" needs no such guard: even without this function,
// foldForMatch already strips "&" and "," identically (both are plain
// punctuation to it), so the artist-matching step in MATCH_TIERS treats
// "A & B" and "A, B" as the same string either way — this only changes
// what text gets sent to a provider's own search endpoint, not what
// ultimately gets accepted as a match. Only ever applied to the artist
// field — a title never carries a multi-artist credit this function should
// touch.
const MULTI_ARTIST_SEPARATOR_RE = /\s+(?:x|&)\s+/g;

export function normalizeArtistSeparators(artist: string): string {
  if (!artist) return artist;
  const normalized = artist.replace(MULTI_ARTIST_SEPARATOR_RE, ', ').trim();
  return normalized || artist;
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
  // "Radio Edit" — unlike a genuine remix (a materially different mix, kept
  // via MEANINGFUL_VERSION_RE below), this is normally just a shortened cut
  // of the very same mix. It's real MEANINGFUL_VERSION_WORDS content too
  // (bare "radio" is on that list, so "Radio Mix"/"Radio Release" etc. are
  // still protected elsewhere), but for THIS fallback's purposes it's not
  // enough of a difference to justify blocking a match against an ordinary
  // HQ file of the same song — a provider search for the full "Radio Edit"
  // title turns up far fewer/no results than the plain title would.
  'radio\\s*edit',
  // "Extended Mix"/"Extended"/"Extended Version" — reverses an earlier
  // stance of always keeping "extended" as protected content (it's still
  // on MEANINGFUL_VERSION_WORDS below, deliberately left there — see the
  // leftover-check next to MEANINGFUL_VERSION_RE for why that no longer
  // matters). Same "Radio Edit" reasoning above, just in the other duration
  // direction: an Extended Mix is normally the same mix as the plain/
  // original one, just longer — and it's usually a LOT longer (often 2x+),
  // so MATCH_TIERS' own duration tolerance reliably rejects a wrong match
  // against the shorter plain version, the same backstop that makes "Radio
  // Edit" safe to strip. When "extended" instead qualifies a named remix —
  // "(Tinlicker Extended Remix)" — only the qualifier itself is dropped;
  // the remixer's own credit is real, load-bearing content, not decoration.
  'extended\\s*version', 'extended',
  // "Radio Version" — synonym for "Radio Edit" above, same reasoning.
  'radio\\s*version',
  // "Album Version" just disambiguates from a shorter single/radio
  // release — the same recording as the plain title, unhelpful in a
  // search query for the same "Radio Edit"/"Extended Mix" reason.
  'album\\s*version',
  // "Original Mix"/"Original Version" — usually the exact recording a
  // provider already lists with no suffix at all (it's the base/default
  // release most catalogs treat as implicit), so this is even lower-risk
  // than "Radio Edit": there's no shorter/longer sibling version it could
  // get confused with, just the same untagged entry a plain-title search
  // already finds.
  'original\\s*mix', 'original\\s*version',
  // "Acoustic" is real MEANINGFUL_VERSION_WORDS content too — a genuinely
  // different arrangement, not just a different edit length, unlike
  // everything else in this block — so this one leans on the same "a
  // specific version essentially never has its own dedicated HQ release"
  // pragmatism as "live" above, not the "same mix, different length"
  // duration-tolerance argument the rest of this list relies on.
  'acoustic',
  // "(Intro)"/"(Outro)" — either a DJ-tool edit of the same mix (same
  // reasoning as "Radio Edit") or a genuinely short, truncated clip of it
  // — either way, MATCH_TIERS' duration check catches a bad match against
  // a full-length candidate, the same backstop this whole list leans on.
  'intro', 'outro',
  // A movie/show soundtrack credit — "(Drive Original Movie Soundtrack)",
  // "(Warm Bodies Soundtrack)" — the actual song still exists as a standalone
  // release a provider can find on its own merits; the film title only ever
  // hurts that search, same reasoning as UPLOAD_NOISE_WORDS in general. Every
  // real case seen so far is the bracket's entire content, so a plain
  // contains-match (dropping the whole bracket) is enough here — the
  // *unbracketed* film-name-plus-"soundtrack" case is handled separately by
  // SOUNDTRACK_TRAILING_RE below, since the film name itself isn't a fixed word.
  'soundtracks?',
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
  // \w* on the Cyrillic stems below is deliberately NOT \w (ASCII-only) —
  // every real inflected form ("Официальное", "Официальный", "Премьера"'s
  // own case endings) continues in Cyrillic, which \w can't consume, so the
  // boundary check right after the stem would fail against the very next
  // (Cyrillic, still-a-letter) character and the word would never match at
  // all. \p{L}\p{N} is the same Unicode-aware class UPLOAD_NOISE_WORD_RE's
  // own boundary lookarounds already use, for the same reason.
  'oficial', 'áudio', 'клип', 'официальн[\\p{L}\\p{N}]*', 'премьера[\\p{L}\\p{N}]*', 'oficialus', 'klipas',
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

// URL/domain promo tags left behind by an uploader's channel branding —
// "(www.Fan-Guf.ru)", "[http://example.com]" — never real title content,
// unlike UPLOAD_NOISE_WORDS' ambiguous words. An explicit http(s):// or
// www. prefix is unambiguous, so it's stripped as a "contains" match
// wherever it appears (like UPLOAD_NOISE_WORD_RE); a bare domain with no
// such prefix (e.g. "(Fan-Guf.ru)") is only stripped when it's a bracket's
// WHOLE content, same safety reasoning as COUNTRY_ONLY_BRACKET_RE/
// YEAR_ONLY_BRACKET_RE above — a domain-shaped word could otherwise
// coincide with real title text.
const URL_RE = /(?:https?:\/\/|www\.)\S+/iu;
const BARE_DOMAIN_ONLY_RE = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:ru|su|ua|by|kz|com|net|org|info|biz|me|tv|fm|club|site|online|top|xyz|name)$/iu;
// Same URL, but trailing and unbracketed — "Song Title - www.fan-guf.ru".
const URL_TRAILING_RE = /[\s\-|/,*•]*(?:https?:\/\/|www\.)\S+[\s!?.]*$/iu;

// A promo @-handle plugged into the title by the uploader — "(@Nilshoffmannmusic)",
// "[@Crimusic]" — the artist's own channel/social handle, never real catalog
// content, same reasoning as URL_RE right above. An "@" directly followed by
// word characters is unambiguous enough (nothing in a real title legitimately
// starts a word with a bare "@") to treat as a "contains" match wherever it
// appears, bracketed or not.
const AT_HANDLE_RE = /(?<![\p{L}\p{N}])@[\p{L}\p{N}_]+/u;
// Same handle, but trailing and unbracketed — "Song Title @artisthandle".
const AT_HANDLE_TRAILING_RE = /[\s\-|/,*•]*(?<![\p{L}\p{N}])@[\p{L}\p{N}_]+[\s!?.]*$/u;

// A film/show title trailing a song title outright, immediately before the
// literal word "Soundtrack" — "Hanging On (I SEE MONSTAS Remix) Divergent
// Soundtrack" — never real song-title content, but unlike the bracketed
// case above (see 'soundtracks?' in UPLOAD_NOISE_WORDS) the film name itself
// varies per track, so this captures a short run of Title-Case words right
// before "soundtrack" and drops the whole run, not just the word — a
// dangling "Divergent" left behind would still hurt a provider search just
// as much as the full phrase would. Deliberately not case-insensitive on
// the qualifier words themselves (only on "soundtrack"): requiring a real
// Title-Case run is what keeps this from eating an ordinary lowercase
// trailing phrase that just happens to end in an unrelated "soundtrack".
const SOUNDTRACK_TRAILING_RE = /[\s\-|/,*•]+(?:[\p{Lu}][\p{L}\p{N}'.-]*\s+){0,5}[Ss]oundtrack\b[\s!?.]*$/u;

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

// Real remix/version credit words (same list as LABEL_TAG_BRACKET_RE's
// guard above) — when one of these shares a bracket with an otherwise
// droppable noise word ("(Skrillex Remix -- BASS BOOSTED)"), dropping the
// whole bracket would lose a genuinely different, real release (a remix is
// not the same recording as the original), not just decoration. Verified
// real case: this exact bracket used to collapse to nothing, and the
// resulting bare "Cinema" search silently matched and replaced the file
// with the ORIGINAL (non-remix) track instead.
const MEANINGFUL_VERSION_RE = new RegExp(`\\b(?:${MEANINGFUL_VERSION_WORDS})\\b`, 'i');
// What's left of a shared bracket after excising noise word(s) can itself
// turn out to be nothing but a bare, contentless "Mix"/"Version"/"Edit" —
// e.g. "(Extended Mix, Official Video)" loses "Official Video" as ordinary
// noise and "Extended" via UPLOAD_NOISE_WORDS above, leaving just "(Mix)",
// which isn't real version information on its own (nothing distinguishes it
// from the plain track — every song's "mix" is implicitly "a mix"). Checked
// against the WHOLE leftover, same exact-content-match safety as
// COUNTRY_ONLY_BRACKET_RE/YEAR_ONLY_BRACKET_RE above — a leftover that
// still has anything else attached (a name, "Radio Mix", etc.) doesn't
// match and survives untouched.
const BARE_VERSION_WORD_RE = /^(mix|version|edit)$/i;
// A soundtrack credit always wins outright, even over MEANINGFUL_VERSION_RE
// above — "original" is real version info in "(Original Mix)" but false
// signal in "(Drive Original Movie Soundtrack)"; a soundtrack bracket in
// practice is never *also* a genuine remix credit sharing the same parens
// (real cases keep them in separate brackets, e.g. "(X Remix) Y Soundtrack"),
// so this is safe to always drop whole rather than risk keeping film-title
// noise the ambiguous "original" match let slip through.
const SOUNDTRACK_WORD_RE = /\bsoundtracks?\b/i;
// Same word list as UPLOAD_NOISE_WORD_RE, but global and with its
// surrounding separator/punctuation included in the match, so it can excise
// just the noise phrase from inside a bracket that also has meaningful
// content, rather than testing for presence only.
const UPLOAD_NOISE_WORD_STRIP_RE = new RegExp(
  `[\\s\\-|/,*•]*(?<![\\p{L}\\p{N}])(${UPLOAD_NOISE_WORDS.join('|')})(?![\\p{L}\\p{N}])[\\s!?.,]*`, 'giu'
);

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
  cleaned = cleaned.replace(/([([])([^)\]]*)([)\]])/g, (whole, open, inner, close) => {
    if (CONTENT_ALTERED_RE.test(inner)) return whole;
    const trimmed = inner.trim();
    if (COUNTRY_ONLY_BRACKET_RE.test(trimmed)
      || YEAR_ONLY_BRACKET_RE.test(trimmed)
      || LABEL_TAG_BRACKET_RE.test(trimmed)
      || URL_RE.test(inner)
      || BARE_DOMAIN_ONLY_RE.test(trimmed)
      || AT_HANDLE_RE.test(inner)) return ' ';
    if (UPLOAD_NOISE_WORD_RE.test(inner)) {
      if (SOUNDTRACK_WORD_RE.test(inner) || !MEANINGFUL_VERSION_RE.test(inner)) return ' ';
      // Real version/remix content shares this bracket with the noise word
      // — excise just the noise phrase(s), keep the rest, same before/after
      // split reasoning as stripFeaturedArtists above.
      const strippedInner = inner.replace(UPLOAD_NOISE_WORD_STRIP_RE, ' ').replace(/\s+/g, ' ').trim();
      if (!strippedInner || BARE_VERSION_WORD_RE.test(strippedInner)) return ' ';
      return `${open}${strippedInner}${close}`;
    }
    return whole;
  });
  for (let i = 0; i < 10; i++) {
    // SOUNDTRACK_TRAILING_RE must run before UPLOAD_NOISE_TRAILING_RE below —
    // both can match a bare trailing "Soundtrack", but the latter only eats
    // the word itself, which would leave the film-name qualifier this one
    // is meant to catch (e.g. "Divergent") stranded with nothing left after
    // it to trigger a second pass.
    let next = cleaned.replace(SOUNDTRACK_TRAILING_RE, '').trim();
    next = next.replace(UPLOAD_NOISE_TRAILING_RE, '').trim();
    next = next.replace(URL_TRAILING_RE, '').trim();
    next = next.replace(AT_HANDLE_TRAILING_RE, '').trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || text.trim();
}

// Some tracks arrive with the whole "Artist "Title"" (or "Artist-"Title"")
// string dumped into the title field alone, with a separate `artist` column
// that's frequently stale/unrelated rather than actually blank — e.g.
// `Rusko feat. Amber Coffman "Hold On"`, `Latyrx "Call to Arms"`,
// `Stands With Fists-"Holiday"`, `Krec "Южные Сны"`. The quoted portion is
// always the real title; the text before it is consistently a more
// trustworthy artist than whatever's already stored, so this extracts BOTH
// halves for a fallback retry rather than just discarding the artist
// outright — MATCH_TIERS has no artist-less tier, every tier requires some
// artist text to compare, so a blank/skipped artist wouldn't actually widen
// the search here the way it sounds like it should. Requires the closing
// quote to be the very last thing in the string (mid-title quoted asides,
// e.g. a nickname, don't have that shape) and returns null rather than a
// no-op unchanged result, so the caller can tell a genuine extraction from
// "this title just isn't quote-wrapped" without comparing strings itself.
const QUOTED_TITLE_RE = /^(.{1,80}?)\s*-?\s*["“„](.+)["”]\s*$/;

export function extractQuotedArtistTitle(rawTitle: string): { artist: string; title: string } | null {
  if (!rawTitle) return null;
  const match = QUOTED_TITLE_RE.exec(rawTitle);
  if (!match) return null;
  const artist = match[1].trim();
  const title = match[2].trim();
  if (!artist || !title) return null;
  return { artist, title };
}

// A title occasionally arrives as the whole "Artist-Title" (or "Artist -
// Title") string with no real split — same shape as
// extractQuotedArtistTitle above, minus the quotes — and, just like that
// case, the separate `artist` field alongside it is frequently unrelated
// rather than blank (real example: title "Rebelheart-Angel" stored next to
// artist "Kaltastu"). Other real examples: "Nas-Just a Moment" (no space at
// all around the dash), "Винт И Мэф - Большой Город (2009) (Ex- Ю.Г.)" (a
// second, unrelated dash sits inside a bracket further in).
//
// Deliberately stricter than splitArtistTitle's "any whitespace-adjacent
// dash" rule: with no quote to anchor on, a lone dash is genuinely ambiguous
// between a hyphenated artist name (T-Pain) and a title that just happens to
// use dashes as its own internal punctuation ("Diversity Dance Performance -
// 2009 - 25th April" — a single event title, not an artist/title pair at
// all). A split is only attempted when there's EXACTLY ONE candidate dash in
// the whole string — bracketed content is masked out first (same technique
// as musicbrainz.ts's parseArtistAndTitle) so an incidental dash inside a
// parenthetical aside doesn't kill an otherwise-unambiguous split, but two or
// more dashes outside any bracket means there's no reliable way to tell
// which one (if any) is the real separator, so this backs off entirely
// rather than guessing wrong. Safe to be more permissive with than
// splitArtistTitle even so — MATCH_TIERS' own text+duration confirmation is
// still what gates an actual replace, so a wrong guess here just fails to
// find a candidate rather than risking a bad download.
const DASH_SEPARATOR_CHAR_RE = /[-–—|~•]/g;

export function extractDashArtistTitle(rawTitle: string): { artist: string; title: string } | null {
  if (!rawTitle) return null;
  const masked = rawTitle.replace(/\([^()]*\)/g, (m) => ' '.repeat(m.length));
  const matches = [...masked.matchAll(DASH_SEPARATOR_CHAR_RE)];
  if (matches.length !== 1) return null;

  const index = matches[0].index!;
  const artist = rawTitle.slice(0, index).trim();
  const title = rawTitle.slice(index + 1).trim();
  if (!artist || !title) return null;
  return { artist, title };
}

// Splits a raw "Artist - Title"-shaped string (typically a Soulseek
// filename, which carries no structured metadata of its own — JioSaavn and
// Deezer candidates never go through this, they already have real artist/
// title fields from their own APIs) into its two halves. Deliberately does
// NOT run musicbrainz.ts's stripJunkTags first, unlike that module's own
// parseArtistAndTitle — this function's caller is about to trust its output
// enough to auto-download and replace a file with it, and stripJunkTags's
// "any bracket not on the remix/version allowlist is discarded as trivia"
// pass is exactly backwards for that: it's fine (even correct) for cleaning
// a video's own title before an independent MusicBrainz lookup, but here it
// actively destroys the evidence that would otherwise prevent a false match.
// Concretely: "Britney Spears - Make Me (Clean) (Funkymix by DJ Rix)" — a
// DJ-pool compilation edit, not the plain track — folded down to "Britney
// Spears - Make Me" once run through stripJunkTags (neither "Clean" nor the
// fused word "Funkymix" is on the allowlist), which then passed MATCH_TIERS'
// second-strictest tier against "Make Me..." even though the real
// similarity between the two full titles is ~0.33, well under the fuzzy
// tier's own 0.82 bar — it should have needed that tier and failed there.
// The caller pre-cleans with stripUploadNoise instead (recognized noise like
// "(Official Audio)" still gets removed — see its own positive-control
// cases — but anything unfamiliar, which is exactly what a mislabeled edit
// looks like, survives and correctly keeps the candidate from matching).
export function splitArtistTitle(rawTitle: string): { artist: string | null; title: string } {
  // Same separator set and "not a bare mid-word hyphen" whitespace
  // requirement as musicbrainz.ts's parseArtistAndTitle.
  const match = rawTitle.match(/^(.{1,70}?)(?:\s+[-–—|~•]\s*|\s*[-–—|~•]\s+)(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };
  return { artist: null, title: rawTitle.trim() };
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

// 'skip' is deliberately not reachable from automatic matching — see
// MATCH_TIERS_TRUSTED_NAME's own doc comment for the one case that uses it.
export type DurationStrictness = 'sanity' | 'moderate' | 'tight' | 'skip';

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
    case 'skip': return Infinity;
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
    // "Don't" vs "Dont", smart quotes vs straight quotes, etc. Non-empty
    // guarded — see foldsEqualNonEmpty's own doc comment.
    textMatch: (ca, ct, a, t) => foldsEqualNonEmpty(ca, a) && foldsEqualNonEmpty(ct, t),
    durationStrictness: 'sanity',
    requireKnownDuration: false,
    minBitrateImprovementKbps: 0,
  },
  {
    // Title still has to match exactly (folded); artist is now allowed to be
    // a superset/subset of ours, tolerating extra featured-artist credits on
    // either side. Non-empty guarded — see foldsEqualNonEmpty's own doc comment.
    textMatch: (ca, ct, a, t) => artistIsSupersetMatch(ca, a) && foldsEqualNonEmpty(ct, t),
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

// Same text-matching tiers as MATCH_TIERS, but the duration check is
// skipped for every tier whose text match already requires an exact (or
// artist-superset) title match — used only for the HQ search that follows a
// manual "Rename track" action (see renameTrack in slskdQualityWorker.ts).
// Duration exists on those tiers purely as a backstop against "same title,
// different recording" (a radio edit vs. album version, a YouTube upload
// with a much longer intro than the canonical release, etc.) when the
// identification itself came from *automatic* matching — once a human has
// just manually typed and confirmed the artist/title, that backstop no
// longer earns its keep and can only cost a legitimate match. The fuzzy
// title-similarity tier is deliberately left untouched even here: there,
// duration is real corroborating evidence for a text match that's only
// approximate to begin with, not just an edition-mismatch guard, so it
// stays required no matter how the search was triggered.
export const MATCH_TIERS_TRUSTED_NAME: MatchTier[] = MATCH_TIERS.map((tier, i) => (
  i < MATCH_TIERS.length - 1 ? { ...tier, durationStrictness: 'skip' } : tier
));

// A provider search result that came back for a query but didn't clear any
// MATCH_TIERS tier — findExactMatchCandidate/findDeezerCandidate/
// findQobuzCandidate/findTidalCandidate collect these into an optional
// out-array instead of just discarding them, so slskdQualityWorker.ts's
// manual single-track search can offer them as one-click rename
// suggestions: often the only thing standing between a video and a real
// match is its own stored artist/title being slightly off (a remix tag, a
// diacritic, a feat. credit) from the provider's canonical one. JioSaavn and
// Bandcamp deliberately don't participate — JioSaavn's Indian-market-skewed
// catalog kept surfacing suggestions that plainly weren't the same song at
// all, worse than not suggesting anything; Bandcamp was never wired up for
// this in the first place.
export interface NearMissCandidate {
  artist: string;
  title: string;
  // So the frontend can show it right next to our own video duration for
  // at-a-glance comparison — not every source reports one, hence nullable.
  durationSec: number | null;
}

const FUZZY_TITLE_SIMILARITY_THRESHOLD = 0.82;
