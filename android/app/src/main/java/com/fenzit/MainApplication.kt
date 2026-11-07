package com.fenzit

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  companion object {
    // Android notification channels (UX spec 2026-11-07 — channels are the
    // user's ONLY noise control in a no-in-app-toggles world). The backend
    // sets the channel per message; `fenzit_default` stays the fallback
    // (it mirrors `messaging_android_notification_channel_id` in
    // firebase.json, where RNFB reads it from — keep the two in sync).
    // Copy constants per the final UX spec (Sally); re-create-on-start is
    // a no-op for existing channels, so every start re-asserts them.
    private const val JOBS_CHANNEL_ID = "fenzit_jobs"
    private const val JOBS_CHANNEL_NAME = "Jobs"
    private const val JOBS_CHANNEL_DESCRIPTION = "Job assignments and job progress updates"

    private const val ATTENDANCE_CHANNEL_ID = "fenzit_attendance"
    private const val ATTENDANCE_CHANNEL_NAME = "Attendance & leave"
    private const val ATTENDANCE_CHANNEL_DESCRIPTION =
      "Check-in reminders, leave decisions and holiday updates"

    private const val REPORTS_CHANNEL_ID = "fenzit_reports"
    private const val REPORTS_CHANNEL_NAME = "Reports"
    private const val REPORTS_CHANNEL_DESCRIPTION =
      "When a report you requested is ready or failed"

    private const val DEFAULT_CHANNEL_ID = "fenzit_default"
    private const val DEFAULT_CHANNEL_NAME = "Updates"
    private const val DEFAULT_CHANNEL_DESCRIPTION = "General updates from Fenzit"
  }

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    loadReactNative(this)
  }

  /**
   * Creates the four notification channels before any notification can
   * arrive (API ≥ 26; RNFB's fallback channel is "Miscellaneous", which is
   * not acceptable UX). HIGH: heads-up + sound (jobs and attendance); the
   * reports channel stays DEFAULT on purpose — owners get several report
   * events a day in busy seasons and they must not interrupt. Re-creating
   * an existing channel is a no-op, so this is safe on every start.
   */
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val jobs = NotificationChannel(
      JOBS_CHANNEL_ID,
      JOBS_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH,
    ).apply { description = JOBS_CHANNEL_DESCRIPTION }
    val attendance = NotificationChannel(
      ATTENDANCE_CHANNEL_ID,
      ATTENDANCE_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH,
    ).apply { description = ATTENDANCE_CHANNEL_DESCRIPTION }
    val reports = NotificationChannel(
      REPORTS_CHANNEL_ID,
      REPORTS_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply { description = REPORTS_CHANNEL_DESCRIPTION }
    val fallback = NotificationChannel(
      DEFAULT_CHANNEL_ID,
      DEFAULT_CHANNEL_NAME,
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply { description = DEFAULT_CHANNEL_DESCRIPTION }
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannels(listOf(jobs, attendance, reports, fallback))
  }
}
