package com.ympv.youtubevault.offlinesyncservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Foreground service whose sole purpose is holding the mandatory ongoing
// notification that surfaces aggregate offline-sync progress (see
// OfflineDownloadsContext.tsx's aggregate progress effect, the only caller of
// update/stop below). Running as a foreground service also exempts this
// process from Android's background execution limits for as long as the
// notification is up, which is what lets an in-progress sync survive the app
// being backgrounded/the screen being locked instead of being throttled
// within a couple of minutes.
class OfflineSyncForegroundService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val completed = intent?.getIntExtra(EXTRA_COMPLETED, 0) ?: 0
    val total = intent?.getIntExtra(EXTRA_TOTAL, 0) ?: 0
    startForegroundWithNotification(buildNotification(completed, total))
    return START_NOT_STICKY
  }

  private fun startForegroundWithNotification(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(completed: Int, total: Int): Notification {
    ensureChannel()

    // total == 0 covers the brief window right after a sync starts, before
    // the manifest fetch that reports how many tracks there are has
    // resolved (see OfflineDownloadsContext's DEFAULT_PROGRESS) — shown as
    // an indeterminate bar rather than a stuck "0 / 0".
    val indeterminate = total <= 0
    val contentText = if (indeterminate) "Preparing…" else "$completed / $total tracks"

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Syncing offline music")
      .setContentText(contentText)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setProgress(if (indeterminate) 0 else total, completed.coerceIn(0, total), indeterminate)
      .apply { if (contentIntent != null) setContentIntent(contentIntent) }
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Offline sync", NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "offline_sync"
    private const val NOTIFICATION_ID = 4201
    private const val EXTRA_COMPLETED = "completed"
    private const val EXTRA_TOTAL = "total"

    // Safe to call repeatedly — each call just posts an updated notification
    // via the same startForeground(id, ...) call, no separate "is it already
    // running" tracking needed on either the Kotlin or JS side.
    fun update(context: Context, completed: Int, total: Int) {
      val intent = Intent(context, OfflineSyncForegroundService::class.java)
        .putExtra(EXTRA_COMPLETED, completed)
        .putExtra(EXTRA_TOTAL, total)
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, OfflineSyncForegroundService::class.java))
    }
  }
}
