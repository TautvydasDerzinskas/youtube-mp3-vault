// Android-only feature (see the module's expo-module.config.json — no iOS
// native implementation exists). A plain no-op stub rather than deferring to
// the base OfflineSyncServiceModule.ts: that file calls requireNativeModule
// at import time, which would throw immediately on iOS since no such native
// module is registered there. Metro resolves this .ios.ts over the bare .ts
// for iOS bundles, so call sites in OfflineDownloadsContext.tsx never reach
// that call and don't need their own per-platform guards.
class OfflineSyncServiceModule {
  updateProgress(_completed: number, _total: number): void {}
  stop(): void {}
}

export default new OfflineSyncServiceModule();
