import type { parseFile as ParseFile } from 'music-metadata';
import { dynamicImport } from './dynamicImport';

export interface AudioProps {
  durationSeconds: number;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

// music-metadata is ESM-only — see dynamicImport.ts. Loaded lazily (rather
// than at module scope) and cached, so importing this file never pays the
// cost/risk of loading it until a probe is actually needed.
let parseFilePromise: Promise<typeof ParseFile> | null = null;
function loadParseFile(): Promise<typeof ParseFile> {
  if (!parseFilePromise) parseFilePromise = dynamicImport('music-metadata').then((mod) => mod.parseFile);
  return parseFilePromise;
}

/** Read duration/sample-rate/bit-depth/channel-count from a finished audio file —
 * used by the post-download preview/truncation guard (see previewDetection.ts).
 * Null on any failure; callers must treat that as "unknown", never as "reject". */
export async function probeAudioFile(filePath: string): Promise<AudioProps | null> {
  try {
    const parseFile = await loadParseFile();
    const metadata = await parseFile(filePath, { duration: true });
    return {
      durationSeconds: metadata.format.duration ?? 0,
      sampleRate: metadata.format.sampleRate ?? 0,
      bitsPerSample: metadata.format.bitsPerSample ?? 0,
      channels: metadata.format.numberOfChannels ?? 0,
    };
  } catch {
    return null;
  }
}
