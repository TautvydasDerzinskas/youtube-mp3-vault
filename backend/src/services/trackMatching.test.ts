import { describe, expect, it } from 'vitest';
import {
  artistIsSupersetMatch,
  extractDashArtistTitle,
  extractQuotedArtistTitle,
  foldForMatch,
  MATCH_TIERS,
  normalizeArtistSeparators,
  splitArtistTitle,
  stripFeaturedArtists,
  stripUploadNoise,
} from './trackMatching';

describe('stripUploadNoise', () => {
  it('drops a recognized noise word bracket', () => {
    expect(stripUploadNoise('Song Title (Official Video)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title [HD]')).toBe('Song Title');
  });

  it('leaves an unfamiliar bracket alone rather than guessing', () => {
    expect(stripUploadNoise('Song Title (Interlude)')).toBe('Song Title (Interlude)');
    expect(stripUploadNoise('Song Title (Bring Your Own Bombs)')).toBe('Song Title (Bring Your Own Bombs)');
  });

  it('strips a bracketed URL/domain promo tag', () => {
    expect(stripUploadNoise('Сто строк (www.Fan-Guf.ru)')).toBe('Сто строк');
    expect(stripUploadNoise('Song Title (Fan-Guf.ru)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title (www.example.com)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title [www.example.com]')).toBe('Song Title');
  });

  it('strips a bare trailing URL with no brackets', () => {
    expect(stripUploadNoise('Song Title www.promo-site.ru')).toBe('Song Title');
    expect(stripUploadNoise('Song Title - http://example.com/free-download')).toBe('Song Title');
  });

  it('strips a bracketed @-handle promo tag', () => {
    expect(stripUploadNoise('9 Days (@Nilshoffmannmusic)')).toBe('9 Days');
    expect(stripUploadNoise('Live from Mile-Ex, Montréal [@Crimusic]')).toBe('Live from Mile-Ex, Montréal');
  });

  it('strips a bare trailing @-handle with no brackets', () => {
    expect(stripUploadNoise('Song Title @artisthandle')).toBe('Song Title');
  });

  it('strips a bracketed movie/show soundtrack credit', () => {
    expect(stripUploadNoise('Nightcall (Drive Original Movie Soundtrack)')).toBe('Nightcall');
    expect(stripUploadNoise('Shell Suite (Warm Bodies Soundtrack)')).toBe('Shell Suite');
  });

  it('strips a trailing unbracketed film name + "Soundtrack", not just the word', () => {
    expect(stripUploadNoise('Hanging On (I SEE MONSTAS Remix) Divergent Soundtrack'))
      .toBe('Hanging On (I SEE MONSTAS Remix)');
  });

  it('keeps a genuine remix/version credit that shares a bracket with noise, excising only the noise', () => {
    // Regression case: this bracket used to be dropped in its entirety
    // because it also contained "BASS BOOSTED", silently losing the remix
    // credit and causing the search to match the original (non-remix) track.
    expect(stripUploadNoise('Cinema (Skrillex Remix -- BASS BOOSTED)')).toBe('Cinema (Skrillex Remix)');
  });

  it('strips "Extended Mix"/"Extended"/"Extended Version" brackets entirely', () => {
    expect(stripUploadNoise('Niton (The Reason) (extended mix)')).toBe('Niton (The Reason)');
    expect(stripUploadNoise('Let It All Out (Extended Mix)')).toBe('Let It All Out');
    expect(stripUploadNoise('Alice (extended)')).toBe('Alice');
    expect(stripUploadNoise('Iconic (Extended Mix) (Light Speed Remix)')).toBe('Iconic (Light Speed Remix)');
    // Unlike the Skrillex/BASS BOOSTED case above, "Extended" sharing a
    // bracket with other noise now also gets excised — and since nothing
    // but the bare, meaningless "Mix" would be left afterwards, the whole
    // bracket is dropped rather than surviving as "(Mix)".
    expect(stripUploadNoise('Song Title (Extended Mix, Official Video)')).toBe('Song Title');
  });

  it('strips just the "extended" qualifier when it names a real remix, keeping the remix credit', () => {
    expect(stripUploadNoise('Hide U (Tinlicker Extended Remix)')).toBe('Hide U (Tinlicker Remix)');
    expect(stripUploadNoise(stripFeaturedArtists('One More (Solomun Extended Remix) [feat. Ad Apt]'))).toBe('One More (Solomun Remix)');
  });

  it('strips a bare trailing "Extended Version"', () => {
    expect(stripUploadNoise('Regrete | Extended Version')).toBe('Regrete');
  });

  it('strips a "Radio Edit" credit, bracketed or bare, unlike a genuine remix', () => {
    expect(stripUploadNoise('Animal Rights (radio edit)')).toBe('Animal Rights');
    expect(stripUploadNoise('Mas Que Nada (radio edit)')).toBe('Mas Que Nada');
    expect(stripUploadNoise('All Day All Night (Radio Edit)')).toBe('All Day All Night');
    expect(stripUploadNoise('Take Over Control Radio Edit')).toBe('Take Over Control');
    // A genuine remix sharing a bracket with "Radio Edit" still survives —
    // only the edit qualifier itself is noise, same partial-strip behavior
    // as the Skrillex Remix/BASS BOOSTED case above.
    expect(stripUploadNoise('Song Title (Radio Edit, David Guetta Remix)')).toBe('Song Title (David Guetta Remix)');
  });

  it('strips "Radio Version"/"Album Version"/"Original Mix"/"Original Version" brackets entirely', () => {
    expect(stripUploadNoise('Song Title (Radio Version)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title (Album Version)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title (Original Mix)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title (Original Version)')).toBe('Song Title');
    // A real remix bracket alongside it still survives untouched.
    expect(stripUploadNoise('Song Title (Original Mix) (Real Remix)')).toBe('Song Title (Real Remix)');
  });

  it('strips "Acoustic"/"Intro"/"Outro" brackets entirely', () => {
    expect(stripUploadNoise('Alice (Acoustic)')).toBe('Alice');
    expect(stripUploadNoise('Song Title (Intro)')).toBe('Song Title');
    expect(stripUploadNoise('Song Title (Outro)')).toBe('Song Title');
  });

  it('never strips content-altered wording (slowed/reverb/etc), even sharing a bracket with noise', () => {
    expect(stripUploadNoise('Song Title (Slowed + Reverb)')).toBe('Song Title (Slowed + Reverb)');
    expect(stripUploadNoise('Song Title (Slowed & Bass Boosted)')).toBe('Song Title (Slowed & Bass Boosted)');
  });

  it('drops a bracket whose whole content is an Eurovision country, but not a mixed one', () => {
    expect(stripUploadNoise('Sweet People (Ukraine)')).toBe('Sweet People');
    expect(stripUploadNoise('Sweet People (Ukraine Remix)')).toBe('Sweet People (Ukraine Remix)');
  });

  it('drops a bracket whose whole content is a bare release year', () => {
    expect(stripUploadNoise('Song Title (2015)')).toBe('Song Title');
  });

  it('drops a label/imprint release tag, but not when it shares a bracket with real version info', () => {
    expect(stripUploadNoise('Song Title [Silk Music]')).toBe('Song Title');
    expect(stripUploadNoise('Song Title [Remix Music]')).toBe('Song Title (Remix Music)');
  });

  it('drops a producer credit bracket', () => {
    expect(stripUploadNoise('Song Title (Prod. Jonah Roy)')).toBe('Song Title');
  });

  it('handles non-English uploader-tag spellings (Cyrillic word boundaries)', () => {
    expect(stripUploadNoise('Song Title (Официальное видео)')).toBe('Song Title');
    expect(stripUploadNoise('Песня (Премьера клипа)')).toBe('Песня');
  });

  it('returns the input unchanged when nothing was stripped', () => {
    expect(stripUploadNoise('Song Title')).toBe('Song Title');
  });

  it('falls back to the original if everything turned out to be junk', () => {
    expect(stripUploadNoise('(Official Video)')).toBe('(Official Video)');
  });
});

describe('stripFeaturedArtists', () => {
  it('drops a bracket that is purely a feat. credit', () => {
    expect(stripFeaturedArtists('Song Title (feat. Artist X)')).toBe('Song Title');
    expect(stripFeaturedArtists('Song Title (ft. Artist X)')).toBe('Song Title');
  });

  it('keeps other content sharing the bracket with a feat. credit', () => {
    expect(stripFeaturedArtists('Song Title (Extended Remix, feat. Artist X)')).toBe('Song Title (Extended Remix)');
  });

  it('strips a bare, unbracketed feat. credit up to the next bracket or end of string', () => {
    expect(stripFeaturedArtists('Song Title Feat. Artist X')).toBe('Song Title');
    // Nothing stops the match before the end of the string, so trailing
    // content after a bare feat. credit is lost too — a real title never
    // puts anything meaningful after a feat. credit, so this is accepted.
    expect(stripFeaturedArtists('Artist feat. Other Artist - Song')).toBe('Artist');
  });

  it('leaves text with no feat. credit unchanged', () => {
    expect(stripFeaturedArtists('Song Title (Extended Mix)')).toBe('Song Title (Extended Mix)');
  });
});

describe('extractQuotedArtistTitle', () => {
  it('extracts artist and title from a plain "Artist "Title"" string', () => {
    expect(extractQuotedArtistTitle('Latyrx "Call to Arms"')).toEqual({ artist: 'Latyrx', title: 'Call to Arms' });
    expect(extractQuotedArtistTitle('Brainstorm "Thunder Without Rain"')).toEqual({
      artist: 'Brainstorm',
      title: 'Thunder Without Rain',
    });
  });

  it('handles a dash with no surrounding space before the quote', () => {
    expect(extractQuotedArtistTitle('Stands With Fists-"Holiday"')).toEqual({
      artist: 'Stands With Fists',
      title: 'Holiday',
    });
  });

  it('keeps a feat. credit in the extracted artist half', () => {
    expect(extractQuotedArtistTitle('Rusko feat. Amber Coffman "Hold On"')).toEqual({
      artist: 'Rusko feat. Amber Coffman',
      title: 'Hold On',
    });
  });

  it('handles non-Latin script inside the quotes', () => {
    expect(extractQuotedArtistTitle('Krec "Южные Сны"')).toEqual({ artist: 'Krec', title: 'Южные Сны' });
  });

  it('returns null for an ordinary title with no trailing quoted segment', () => {
    expect(extractQuotedArtistTitle('Song Title (Extended Mix)')).toBeNull();
    expect(extractQuotedArtistTitle('Just A Title')).toBeNull();
  });

  it('returns null for a mid-title quoted aside, not just a trailing one', () => {
    expect(extractQuotedArtistTitle('Ol\' Dirty Bastard "ODB" Freestyle')).toBeNull();
  });
});

describe('extractDashArtistTitle', () => {
  it('splits an unspaced dash with a single word on each side', () => {
    expect(extractDashArtistTitle('Rebelheart-Angel')).toEqual({ artist: 'Rebelheart', title: 'Angel' });
  });

  it('splits an unspaced dash even when the title side has multiple words', () => {
    expect(extractDashArtistTitle('Nas-Just a Moment')).toEqual({ artist: 'Nas', title: 'Just a Moment' });
  });

  it('ignores a second dash sitting inside a bracket', () => {
    expect(extractDashArtistTitle('Винт И Мэф - Большой Город (2009) (Ex- Ю.Г.)')).toEqual({
      artist: 'Винт И Мэф',
      title: 'Большой Город (2009) (Ex- Ю.Г.)',
    });
  });

  it('refuses to guess when there are two or more unbracketed dashes', () => {
    expect(extractDashArtistTitle('Diversity Dance Performance - 2009 - 25th April')).toBeNull();
  });

  it('returns null when there is no dash at all', () => {
    expect(extractDashArtistTitle('Just A Title')).toBeNull();
  });
});

describe('splitArtistTitle', () => {
  it('splits on a dash-like separator with whitespace on at least one side', () => {
    expect(splitArtistTitle('Artist - Title')).toEqual({ artist: 'Artist', title: 'Title' });
  });

  it('does not split on a bare mid-word hyphen with no surrounding whitespace', () => {
    expect(splitArtistTitle('T-Pain Buy U a Drank')).toEqual({ artist: null, title: 'T-Pain Buy U a Drank' });
  });

  it('returns a null artist when there is no separator at all', () => {
    expect(splitArtistTitle('Just A Title')).toEqual({ artist: null, title: 'Just A Title' });
  });
});

describe('normalizeArtistSeparators', () => {
  it('turns a lowercase "x" collab connector into a comma', () => {
    expect(normalizeArtistSeparators('Leon Somov x Saulės Kliošas')).toBe('Leon Somov, Saulės Kliošas');
  });

  it('turns an "&" collab connector into a comma', () => {
    expect(normalizeArtistSeparators('Leon Somov & Saulės Kliošas')).toBe('Leon Somov, Saulės Kliošas');
  });

  it('normalizes every connector in a 3+-way collab, mixed separators included', () => {
    expect(normalizeArtistSeparators('A x B & C')).toBe('A, B, C');
  });

  it('leaves an uppercase "X" alone — more likely part of a real name than a collab marker', () => {
    expect(normalizeArtistSeparators('X Ambassadors')).toBe('X Ambassadors');
  });

  it('returns the input unchanged when there is no connector', () => {
    expect(normalizeArtistSeparators('Skepta')).toBe('Skepta');
  });
});

describe('artistIsSupersetMatch', () => {
  it('rejects a different artist whose multi-word name merely starts with ours', () => {
    // Regression: "Moon" is not a token of "Moon Squid" even though the
    // fully-folded string "moon squid" contains "moon" as a raw substring.
    expect(artistIsSupersetMatch('Moon Squid', 'Moon')).toBe(false);
    expect(artistIsSupersetMatch('Moon', 'Moon Squid')).toBe(false);
  });

  it('accepts a candidate carrying one extra comma-separated collaborator', () => {
    expect(artistIsSupersetMatch('RSAC, ELLA', 'RSAC')).toBe(true);
    expect(artistIsSupersetMatch('RSAC', 'RSAC, ELLA')).toBe(true);
  });

  it('accepts a candidate carrying an extra feat./ft. credit', () => {
    expect(artistIsSupersetMatch('Artist feat. Other', 'Artist')).toBe(true);
  });

  it('accepts an "&"/" x " collab credit against its comma-separated equivalent', () => {
    expect(artistIsSupersetMatch('Sub Focus, Culture Shock & Fragma', 'Sub Focus, Culture Shock, Fragma')).toBe(true);
  });

  it('rejects two artists sharing only a short word-prefix, not a full token', () => {
    expect(artistIsSupersetMatch('Ashley', 'Ash')).toBe(false);
  });

  it('rejects when either side is empty', () => {
    expect(artistIsSupersetMatch('', 'Moon')).toBe(false);
    expect(artistIsSupersetMatch('Moon', '')).toBe(false);
  });
});

describe('MATCH_TIERS', () => {
  it('folds a fully non-Latin-script string down to empty', () => {
    // Documents *why* the regression test below matters: foldForMatch's
    // stripping regex is ASCII-only, so a purely Cyrillic string survives
    // with nothing left.
    expect(foldForMatch('УННВ')).toBe('');
    expect(foldForMatch('Мысли')).toBe('');
  });

  it('does not match two unrelated Cyrillic-titled tracks just because they both fold to empty', () => {
    // Regression: tier 2/3's foldForMatch-based equality used to compare
    // "" === "" for any pair of fully Cyrillic (or Greek/CJK/Arabic/Hebrew)
    // strings, matching them trivially regardless of actual content. Real
    // case that slipped through before the fix: "УННВ - Мысли" fold-matched
    // "Увула - Ты и твоя тень" and got auto-replaced from Tidal.
    const candidateArtist = 'Увула';
    const candidateTitle = 'Ты и твоя тень';
    const ourArtist = 'УННВ';
    const ourTitle = 'Мысли';
    for (const tier of MATCH_TIERS) {
      expect(tier.textMatch(candidateArtist, candidateTitle, ourArtist, ourTitle)).toBe(false);
    }
  });

  it('still matches an exact Cyrillic artist+title pair on the unfolded tier', () => {
    expect(MATCH_TIERS[0].textMatch('УННВ', 'Мысли', 'УННВ', 'Мысли')).toBe(true);
  });
});
