import { config } from '../config';

export interface AudioAnalysisResult {
  genres: string[];
  confidence: number;
  embedding: number[];
}

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
