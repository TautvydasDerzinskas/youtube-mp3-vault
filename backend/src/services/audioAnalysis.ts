import { config } from '../config';

export interface AudioAnalysisResult {
  // Broad parent genres the track scores highly on (e.g. ["Electronic",
  // "Hip Hop"] for a genuine hybrid), plus the single most specific style
  // appended if distinct — see audio-analysis/app.py's analyze().
  genres: string[];
  confidence: number;
  embedding: number[];
}

/**
 * Calls the local Essentia audio-analysis service (see /audio-analysis) with
 * the shared-volume path to an already-downloaded MP3. Fully offline — unlike
 * musicbrainz.ts, this never touches the network and isn't gated on
 * isOnline().
 *
 * Returns null only for a failure specific to this file (corrupt audio,
 * unreadable path, etc.) — the caller treats that as a terminal per-video
 * failure. A network-level error (service not reachable at all) is left to
 * throw, since that's a "come back later" condition, not this video's fault.
 */
export async function analyzeAudio(filePath: string): Promise<AudioAnalysisResult | null> {
  const res = await fetch(`${config.audioAnalysisUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });

  if (!res.ok) {
    console.error(`[audio-analysis] ${filePath}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    return null;
  }

  return (await res.json()) as AudioAnalysisResult;
}
