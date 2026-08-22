import { registerWebModule, NativeModule } from 'expo';

// Android-only feature (see the module's expo-module.config.json) — web/iOS
// get a no-op so call sites in OfflineDownloadsContext.tsx don't need their
// own per-platform guards.
class OfflineSyncServiceModule extends NativeModule<{}> {
  updateProgress(_completed: number, _total: number): void {}
  stop(): void {}
}

export default registerWebModule(OfflineSyncServiceModule, 'OfflineSyncServiceModule');
