import { mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../../config';

// Small persisted cache directory for the Qobuz fallback source (scraped API
// credentials, community verification session) — lives under the existing
// music_data volume the backend already mounts (see config.musicDir), so no
// separate Docker volume is needed just for this.
export function qobuzDataDir(): string {
  return join(config.musicDir, 'qobuz');
}

export async function ensureQobuzDataDir(): Promise<string> {
  const dir = qobuzDataDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}
