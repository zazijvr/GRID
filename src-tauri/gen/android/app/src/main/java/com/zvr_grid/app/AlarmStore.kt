package com.zvr_grid.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/**
 * Budík (jen Android). Zdroj pravdy je tady v nativní části – budíky musí fungovat i bez spuštěné aplikace
 * (zavřená aplikace, zamčený telefon, po restartu). Webová část seznam jen zobrazuje a posílá změny
 * (MainActivity, zprávy alarms:*).
 *
 * Zvuk: skladba se při uložení budíku zkopíruje do úložiště aplikace (alarm-audio/<id>), takže zazvoní,
 * i když ji uživatel mezitím smaže z playlistu. Rádio hraje přímo stream; když nezačne nebo vypadne,
 * hraje záložní skladba, a když není ani ta, systémový zvuk budíku (AlarmRingService).
 */
data class GridAlarm(
  val id: String,
  val enabled: Boolean,
  val hour: Int,
  val minute: Int,
  /** Dny opakování: bit 0 = pondělí … bit 6 = neděle; 0 = jen jednou */
  val days: Int,
  val snoozeMin: Int,
  val label: String,
  /** "track" | "playlist" | "radio" | "system" */
  val source: String,
  val trackFile: String,
  val trackName: String,
  /** Playlist: klíče zkopírovaných skladeb (hrají postupně dokola) a název playlistu do trackName */
  val playlistFiles: List<String>,
  val radioUrl: String,
  val radioName: String,
  val backupFile: String,
  val backupName: String,
  /** Postupné zesilování (30 s) */
  val ramp: Boolean,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("enabled", enabled).put("hour", hour).put("minute", minute).put("days", days)
    .put("snoozeMin", snoozeMin).put("label", label).put("source", source)
    .put("trackFile", trackFile).put("trackName", trackName).put("playlistFiles", JSONArray(playlistFiles))
    .put("radioUrl", radioUrl).put("radioName", radioName)
    .put("backupFile", backupFile).put("backupName", backupName).put("ramp", ramp)

  /** Co hraje – pro zvonicí obrazovku */
  fun soundName(): String = when (source) {
    "track", "playlist" -> trackName
    "radio" -> radioName
    else -> "Zvuk budíku"
  }

  companion object {
    private val SAFE_ID = Regex("^[A-Za-z0-9_-]{1,64}$")

    /** Ze zprávy webové části – vše ověřit (zpráva přichází z WebView) */
    fun fromJson(o: JSONObject): GridAlarm? {
      val id = o.optString("id")
      if (!SAFE_ID.matches(id)) return null
      val hour = o.optInt("hour", -1)
      val minute = o.optInt("minute", -1)
      if (hour !in 0..23 || minute !in 0..59) return null
      val source = o.optString("source").takeIf { it in setOf("track", "playlist", "radio", "system") } ?: "system"
      val radioUrl = o.optString("radioUrl").take(2000).takeIf { it.startsWith("http://") || it.startsWith("https://") } ?: ""
      fun file(key: String) = o.optString(key).takeIf { SAFE_ID.matches(it) } ?: ""
      return GridAlarm(
        id = id,
        enabled = o.optBoolean("enabled", true),
        hour = hour,
        minute = minute,
        days = o.optInt("days", 0) and 0x7F,
        snoozeMin = o.optInt("snoozeMin", 10).coerceIn(1, 60),
        label = o.optString("label").take(60),
        source = source,
        trackFile = file("trackFile"),
        trackName = o.optString("trackName").take(200),
        playlistFiles = o.optJSONArray("playlistFiles")?.let { arr ->
          (0 until minOf(arr.length(), 20)).map { arr.optString(it) }.filter { SAFE_ID.matches(it) }
        } ?: emptyList(),
        radioUrl = radioUrl,
        radioName = o.optString("radioName").take(200),
        backupFile = file("backupFile"),
        backupName = o.optString("backupName").take(200),
        ramp = o.optBoolean("ramp", true),
      )
    }
  }
}

object AlarmStore {
  private const val PREFS = "grid_alarms"
  private const val KEY = "list"
  const val ACTION_FIRE = "com.zvr_grid.app.ALARM_FIRE"
  const val EXTRA_ID = "alarm_id"
  const val EXTRA_SNOOZE = "snooze"
  const val ACTION_CANCEL_SNOOZE = "com.zvr_grid.app.ALARM_CANCEL_SNOOZE"
  /** Odložení: id budíku → čas zazvonění (ms). Zvlášť od seznamu, aby přežilo úpravy budíků i restart. */
  private const val SNOOZE_PREFS = "grid_alarm_snooze"
  private const val SNOOZE_CHANNEL = "alarm_snooze"

  fun audioDir(context: Context): File = File(context.filesDir, "alarm-audio").apply { mkdirs() }
  fun audioFile(context: Context, key: String): File? =
    if (key.isEmpty()) null else File(audioDir(context), key).takeIf { it.isFile && it.length() > 0 }

  fun load(context: Context): List<GridAlarm> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"
    val arr = try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
    return (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { GridAlarm.fromJson(it) } }
  }

  fun get(context: Context, id: String): GridAlarm? = load(context).firstOrNull { it.id == id }

  private fun save(context: Context, list: List<GridAlarm>) {
    val arr = JSONArray().apply { list.forEach { put(it.toJson()) } }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
  }

  /** Nový seznam z aplikace: uložit, přeplánovat, smazat zvuky, které už žádný budík nepoužívá */
  fun replaceAll(context: Context, list: List<GridAlarm>) {
    load(context).forEach { cancel(context, it) }
    save(context, list)
    list.forEach { schedule(context, it) }
    restoreSnoozes(context)
    val used = list.flatMap { listOf(it.trackFile, it.backupFile) + it.playlistFiles }.filter { it.isNotEmpty() }.toSet()
    audioDir(context).listFiles()?.forEach { f ->
      // nedokončené kopie (.part) i nepoužívané soubory pryč
      if (f.name !in used) f.delete()
    }
  }

  fun update(context: Context, alarm: GridAlarm) {
    save(context, load(context).map { if (it.id == alarm.id) alarm else it })
  }

  fun rescheduleAll(context: Context) {
    load(context).forEach { schedule(context, it) }
    restoreSnoozes(context)
  }

  // ───────────── Plánování ─────────────

  /** Nejbližší čas zazvonění po „now“ (v ms), nebo null, když budík nemá zvonit */
  fun nextTrigger(alarm: GridAlarm, now: Long = System.currentTimeMillis()): Long? {
    if (!alarm.enabled) return null
    val cal = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, alarm.hour)
      set(Calendar.MINUTE, alarm.minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    for (i in 0..7) {
      if (cal.timeInMillis > now) {
        // Calendar: neděle = 1 … sobota = 7 → bit 0 = pondělí … bit 6 = neděle
        val bit = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7
        if (alarm.days == 0 || (alarm.days shr bit) and 1 == 1) return cal.timeInMillis
      }
      cal.add(Calendar.DAY_OF_MONTH, 1)
    }
    return null
  }

  private fun fireIntent(context: Context, id: String, snooze: Boolean): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      // jednoznačná adresa = samostatný PendingIntent pro každý budík i jeho odložení
      .setData(Uri.parse("grid-alarm://${if (snooze) "snooze" else "alarm"}/$id"))
      .putExtra(EXTRA_ID, id)
      .putExtra(EXTRA_SNOOZE, snooze)
    return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun showIntent(context: Context): PendingIntent =
    PendingIntent.getActivity(
      context, 0,
      Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  /** Přesné budíky povolené? (Android 12+ je uživatel může vypnout, Android 14+ je nové aplikaci nedá sám) */
  fun canExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
  }

  private fun setAt(context: Context, time: Long, pi: PendingIntent) {
    val am = context.getSystemService(AlarmManager::class.java)
    if (canExact(context)) {
      // Budík v pravém smyslu: vzbudí telefon i v úsporném režimu, ve stavové liště ikona budíku
      am.setAlarmClock(AlarmManager.AlarmClockInfo(time, showIntent(context)), pi)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      // Bez povolení přesných budíků – systém může zazvonění o pár minut posunout (aplikace na to upozorní)
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, pi)
    } else {
      am.set(AlarmManager.RTC_WAKEUP, time, pi)
    }
  }

  fun schedule(context: Context, alarm: GridAlarm) {
    val pi = fireIntent(context, alarm.id, false)
    val time = nextTrigger(alarm)
    if (time == null) context.getSystemService(AlarmManager::class.java).cancel(pi) else setAt(context, time, pi)
  }

  // ───────────── Odložení ─────────────

  fun snoozes(context: Context): Map<String, Long> {
    val prefs = context.getSharedPreferences(SNOOZE_PREFS, Context.MODE_PRIVATE)
    return prefs.all.mapNotNull { (k, v) -> (v as? Long)?.let { k to it } }.toMap()
  }

  fun scheduleSnooze(context: Context, alarm: GridAlarm) {
    val time = System.currentTimeMillis() + alarm.snoozeMin * 60_000L
    context.getSharedPreferences(SNOOZE_PREFS, Context.MODE_PRIVATE).edit().putLong(alarm.id, time).apply()
    setAt(context, time, fireIntent(context, alarm.id, true))
    showSnoozeNotification(context, alarm, time)
  }

  /** Odložení skončilo (zazvonilo) nebo ho uživatel zrušil */
  fun clearSnooze(context: Context, id: String, cancelAlarm: Boolean) {
    context.getSharedPreferences(SNOOZE_PREFS, Context.MODE_PRIVATE).edit().remove(id).apply()
    if (cancelAlarm) context.getSystemService(AlarmManager::class.java).cancel(fireIntent(context, id, true))
    context.getSystemService(NotificationManager::class.java).cancel(snoozeNotificationId(id))
  }

  /** Po úpravě budíků / restartu: odložení existujících budíků znovu naplánovat, prošlá a osiřelá zahodit */
  private fun restoreSnoozes(context: Context) {
    val now = System.currentTimeMillis()
    val alarms = load(context).associateBy { it.id }
    for ((id, time) in snoozes(context)) {
      val alarm = alarms[id]
      if (alarm == null || time <= now) { clearSnooze(context, id, true); continue }
      setAt(context, time, fireIntent(context, id, true))
      showSnoozeNotification(context, alarm, time)
    }
  }

  private fun snoozeNotificationId(id: String) = 1000 + (id.hashCode() and 0x7fff)

  /** Oznámení „Budík odložen – zazvoní v 6:40“ s odpočtem a tlačítkem Zrušit odložení */
  private fun showSnoozeNotification(context: Context, alarm: GridAlarm, time: Long) {
    val nm = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(SNOOZE_CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(SNOOZE_CHANNEL, context.getString(R.string.alarm_snooze_channel), NotificationManager.IMPORTANCE_LOW)
          .apply { setShowBadge(false); lockscreenVisibility = Notification.VISIBILITY_PUBLIC },
      )
    }
    val cancel = PendingIntent.getBroadcast(
      context, 0,
      Intent(context, AlarmReceiver::class.java).setAction(ACTION_CANCEL_SNOOZE)
        .setData(Uri.parse("grid-alarm://cancel-snooze/${alarm.id}")).putExtra(EXTRA_ID, alarm.id),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val at = java.text.SimpleDateFormat("H:mm", java.util.Locale.getDefault()).format(java.util.Date(time))
    val n = NotificationCompat.Builder(context, SNOOZE_CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_grid)
      .setColor(0xFF01DAF6.toInt())
      .setContentTitle(context.getString(R.string.alarm_snoozed_title, at))
      .setContentText(alarm.label.ifEmpty { alarm.soundName() })
      .setWhen(time)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(true) // odpočet do zazvonění
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(showIntent(context))
      .addAction(0, context.getString(R.string.alarm_cancel_snooze), cancel)
      .build()
    try { nm.notify(snoozeNotificationId(alarm.id), n) } catch (e: SecurityException) { /* oznámení zakázaná */ }
  }

  fun cancel(context: Context, alarm: GridAlarm) {
    val am = context.getSystemService(AlarmManager::class.java)
    am.cancel(fireIntent(context, alarm.id, false))
    am.cancel(fireIntent(context, alarm.id, true))
  }

  /** Po zazvonění: jednorázový budík vypnout, opakovaný naplánovat na další den */
  fun afterFire(context: Context, alarm: GridAlarm) {
    if (alarm.days == 0) update(context, alarm.copy(enabled = false)) else schedule(context, alarm)
  }
}
