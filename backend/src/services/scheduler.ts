import cron from 'node-cron';
import { syncAllPlaylists } from './syncService';

export function startScheduler(): void {
  // Every Friday at midnight (server-local time — no explicit timezone set).
  cron.schedule('0 0 * * 5', () => {
    console.log('[scheduler] Starting weekly sync tick');
    syncAllPlaylists().catch((err) => {
      console.error('[scheduler] Sync tick failed:', err);
    });
  });

  console.log('[scheduler] Cron job registered: every Friday at midnight');
}
