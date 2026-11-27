package com.zvr_grid.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Čas budíku nastal (jen vlastní PendingIntent z AlarmStore – receiver není dostupný jiným aplikacím) */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmStore.EXTRA_ID) ?: return
    if (intent.action == AlarmStore.ACTION_CANCEL_SNOOZE) {
      // „Zrušit odložení“ v oznámení
      AlarmStore.clearSnooze(context, id, true)
      MainActivity.notifyAlarmsChanged()
      return
    }
    if (intent.action != AlarmStore.ACTION_FIRE) return
    val alarm = AlarmStore.get(context, id) ?: return
    val snooze = intent.getBooleanExtra(AlarmStore.EXTRA_SNOOZE, false)
    if (snooze) AlarmStore.clearSnooze(context, id, false)
    // Vypnutý budík nezvoní – kromě odložení, které uživatel právě nastavil
    if (!alarm.enabled && !snooze) return
    AlarmRingService.start(context, alarm.id)
    if (!snooze) AlarmStore.afterFire(context, alarm)
  }
}

/** Po restartu telefonu, aktualizaci aplikace nebo změně času systém budíky zapomene – naplánovat znovu */
class AlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" -> AlarmStore.rescheduleAll(context)
    }
  }
}
