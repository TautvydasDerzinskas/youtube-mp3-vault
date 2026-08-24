import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveFallbackMetadata, lookupTrackMetadata, parseArtistAndTitle, toTitleCase } from './musicbrainz';

function mbRecording(opts: { id: string; score: number; title: string; disambiguation?: string }) {
  return {
    id: opts.id,
    score: opts.score,
    title: opts.title,
    disambiguation: opts.disambiguation ?? '',
    'artist-credit': [{ name: 'Benny Benassi' }],
    releases: [{ status: 'Official', 'release-group': { 'primary-type': 'Single', 'secondary-types': [] } }],
  };
}

describe('parseArtistAndTitle', () => {
  it('splits a plain "Artist - Title" string', () => {
    expect(parseArtistAndTitle('Kavinsky - Nightcall', null)).toEqual({ artist: 'Kavinsky', title: 'Nightcall' });
  });

  it('does not mistake a dash inside a bracket for the artist/title separator', () => {
    // Regression case: a naive split used to tear this in half at the "--"
    // inside the remix bracket ("Cinema (Skrillex Remix" / "BASS BOOSTED)"),
    // losing the remix credit entirely and silently matching the original
    // (non-remix) track downstream.
    expect(parseArtistAndTitle('Benny Benassi - Cinema (Skrillex Remix -- BASS BOOSTED)', null)).toEqual({
      artist: 'Benny Benassi',
      title: 'Cinema (Skrillex Remix -- BASS BOOSTED)',
    });
  });

  it('does not split on a bare mid-word hyphen in the artist name', () => {
    expect(parseArtistAndTitle('T-Pain - Buy U a Drank', null)).toEqual({ artist: 'T-Pain', title: 'Buy U a Drank' });
  });

  it('splits on a colon separator', () => {
    expect(parseArtistAndTitle('Kavinsky: Nightcall', null)).toEqual({ artist: 'Kavinsky', title: 'Nightcall' });
  });

  it('splits a "Title by Artist" pattern', () => {
    expect(parseArtistAndTitle('Nightcall by Kavinsky', null)).toEqual({ artist: 'Kavinsky', title: 'Nightcall' });
  });

  it('strips a recognized junk bracket before falling back to the channel name', () => {
    // "Some Channel" would be a bad choice here — cleanChannelName strips a
    // trailing "Channel"/"Music"/"Records"/"VEVO"/"Official" suffix by design.
    expect(parseArtistAndTitle('Song Title (Official Video)', 'SomeUploader')).toEqual({
      artist: 'SomeUploader',
      title: 'Song Title',
    });
  });

  it('keeps a bracket carrying real version/remix info', () => {
    expect(parseArtistAndTitle('Song Title (Extended Mix)', null)).toEqual({
      artist: null,
      title: 'Song Title (Extended Mix)',
    });
  });

  it('falls back to a null artist with no channel name and no separator', () => {
    expect(parseArtistAndTitle('Just A Title', null)).toEqual({ artist: null, title: 'Just A Title' });
  });
});

describe('toTitleCase', () => {
  it('capitalizes each word but keeps minor connector words lowercase mid-string', () => {
    expect(toTitleCase('in the end')).toBe('In the End');
    expect(toTitleCase('a song for you')).toBe('A Song for You');
  });

  it('capitalizes each hyphen/slash-separated segment', () => {
    expect(toTitleCase('t-pain')).toBe('T-Pain');
  });

  it('keeps a contraction suffix lowercase after an apostrophe', () => {
    expect(toTitleCase("won't stop")).toBe("Won't Stop");
    expect(toTitleCase("carla's dreams")).toBe("Carla's Dreams");
  });
});

describe('lookupTrackMetadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers a remix candidate over the original when the source title itself says remix', async () => {
    // Regression case: a remix disambiguation used to always take a flat -50
    // penalty regardless of what the source title said, so even a remix
    // that MusicBrainz's own search ranked higher than the original lost to
    // it anyway — silently overwriting the remix's title/artist with the
    // original's, which then made the HQ scan search for and download the
    // wrong (non-remix) track.
    const original = mbRecording({ id: 'orig-id', score: 85, title: 'Cinema' });
    const remix = mbRecording({ id: 'remix-id', score: 92, title: 'Cinema (Skrillex Remix)', disambiguation: 'Skrillex Remix' });

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/recording/?query=')) {
        return { ok: true, json: async () => ({ recordings: [original, remix] }) };
      }
      const detail = url.includes('remix-id') ? remix : original;
      return { ok: true, json: async () => ({ ...detail, 'first-release-date': null, releases: [{ title: 'Cinema (Skrillex Remix)' }] }) };
    }));

    const result = await lookupTrackMetadata('Benny Benassi - Cinema (Skrillex Remix -- BASS BOOSTED)', null);
    expect(result?.mbRecordingId).toBe('remix-id');
    expect(result?.title).toBe('Cinema (Skrillex Remix)');
  }, 10_000);
});

describe('deriveFallbackMetadata', () => {
  it('parses and title-cases a lowercase "artist - title" video title', () => {
    expect(deriveFallbackMetadata('kavinsky - nightcall', null)).toEqual({ artist: 'Kavinsky', title: 'Nightcall' });
  });

  it('preserves a remix credit through both parsing and title-casing', () => {
    expect(deriveFallbackMetadata('benny benassi - cinema (skrillex remix)', null)).toEqual({
      artist: 'Benny Benassi',
      title: 'Cinema (Skrillex Remix)',
    });
  });
});
