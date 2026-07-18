import cron from 'node-cron';
import { syncAllPlaylists } from './syncService';

export function startScheduler(): void {
  // Every 3 hours at minute 0: 00:00, 03:00, 06:00 …
  cron.schedule('0 */3 * * *', () => {
    console.log('[scheduler] Starting 3-hour sync tick');
    syncAllPlaylists().catch((err) => {
      console.error('[scheduler] Sync tick failed:', err);
    });
  });

  console.log('[scheduler] Cron job registered: every 3 hours');
}
