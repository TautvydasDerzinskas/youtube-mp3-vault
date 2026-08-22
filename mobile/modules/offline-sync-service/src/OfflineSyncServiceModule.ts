import { NativeModule, requireNativeModule } from 'expo';

declare class OfflineSyncServiceModule extends NativeModule<{}> {
  // Posts/updates the ongoing "Syncing offline music" notification. Safe to
  // call repeatedly (e.g. once per completed track) — see
  // OfflineSyncForegroundService.update's own doc comment.
  updateProgress(completed: number, total: number): void;
  // Tears down the foreground service and dismisses the notification once
  // nothing is syncing.
  stop(): void;
}

export default requireNativeModule<OfflineSyncServiceModule>('OfflineSyncService');
