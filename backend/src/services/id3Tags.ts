import NodeID3 from 'node-id3';
import { getSharedFilePath } from './downloader';

export interface TrackTagData {
  title: string;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  releaseYear: number | null;
  genres: string[];
}

// Writes ID3v2 tags into an already-downloaded mp3 using this app's own
// cleaned-up metadata (post MusicBrainz/heuristic normalization — see
// metadataWorker.ts's resolvePlaylistMetadata) rather than leaving whatever
// yt-dlp's own --add-metadata pass wrote at download time, which only ever
// has the raw YouTube title/channel name to work with. Called from three
// places: metadataWorker.ts (title/artist/album/trackNumber/year, as soon as
// each resolves), audioAnalysisWorker.ts (genre, once analysis assigns one),
// and the admin-triggered rebuildPlaylistTags (see reimport.ts) that just
// re-applies whatever's currently in the DB without touching either pass.
//
// Uses update() (merges into the existing frame set) rather than write()
// (replaces it outright) specifically so the cover art yt-dlp already
// embedded via --embed-thumbnail survives.
//
// MediaFile rows are deduped by youtubeId across every playlist/user (see
// syncService.ts's resolveMediaFile) — the file this writes to is shared,
// so whichever PlaylistVideo row's pass runs last "wins" the tags. In
// practice metadata resolution converges to the same result for the same
// underlying video regardless of which playlist triggered it, so this is an
// acceptable tradeoff rather than something worth a per-playlist tag store.
export function writeTrackTags(filename: string, data: TrackTagData): boolean {
  const tags: NodeID3.Tags = {
    title: data.title,
    artist: data.artist ?? undefined,
    album: data.album ?? undefined,
    trackNumber: data.trackNumber != null ? String(data.trackNumber) : undefined,
    year: data.releaseYear != null ? String(data.releaseYear) : undefined,
    genre: data.genres.length > 0 ? data.genres.join('/') : undefined,
  };

  try {
    const result = NodeID3.update(tags, getSharedFilePath(filename));
    if (result !== true) {
      console.error(`[id3] Failed to write tags to ${filename}:`, result);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[id3] Failed to write tags to ${filename}:`, err);
    return false;
  }
}
