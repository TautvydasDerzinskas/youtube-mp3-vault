package com.ympv.youtubevault.offlinesyncservice

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS-facing surface for the aggregate offline-sync progress notification —
// see OfflineSyncForegroundService for what actually posts/updates it, and
// OfflineDownloadsContext.tsx (mobile/src/offline) for the only caller of
// these two functions.
class OfflineSyncServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OfflineSyncService")

    Function("updateProgress") { completed: Int, total: Int ->
      val context = appContext.reactContext ?: return@Function Unit
      OfflineSyncForegroundService.update(context, completed, total)
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function Unit
      OfflineSyncForegroundService.stop(context)
    }
  }
}
