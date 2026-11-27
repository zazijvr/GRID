package com.zvr_grid.app

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import java.io.File
import java.util.concurrent.Executors
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.lang.ref.WeakReference

class MainActivity : TauriActivity() {

  companion object {
    private const val WEBSITE = "https://zazijvr.cz"
    private var current: WeakReference<MainActivity>? = null

    /** Povel pro přehrávač v aplikaci: play | pause | toggle | next | prev | seek:<ms> */
    fun sendMedia(command: String) {
      val activity = current?.get() ?: return
      val arg = JSONObject.quote(command)
      activity.runOnUiThread {
        activity.webView?.evaluateJavascript("window.__gridMedia && window.__gridMedia($arg)", null)
      }
    }

    /** Budíky se změnily mimo aplikaci (zazvonil jednorázový, odložení…) → webová část si načte seznam znovu */
    fun notifyAlarmsChanged() {
      val activity = current?.get() ?: return
      activity.runOnUiThread { activity.alarmReply(JSONObject().put("type", "changed")) }
    }
  }

  private var webView: WebView? = null
  /** Hraje hudba – WebView se pak při odchodu z aplikace neuspí */
  private var playing = false
  private var askedNotifications = false
  /** Budíky: zápis souborů a seznamu postupně v jednom vlákně (pořadí zpráv z aplikace se zachová) */
  private val alarmWorker = Executors.newSingleThreadExecutor()

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    current = WeakReference(this)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    setupBridge(webView)
    setupBack(webView)
  }

  /**
   * Tauri (WryActivity) při odchodu z aplikace volá WebView.onPause(), které může zastavit zvuk.
   * Hudební přehrávač musí hrát dál (zhasnutá obrazovka, jiná aplikace) → při přehrávání vzbudit.
   */
  override fun onPause() {
    super.onPause()
    if (playing) webView?.onResume()
  }

  override fun onDestroy() {
    alarmWorker.shutdown()
    if (current?.get() === this) current = null
    MediaPlaybackService.stop(this)
    super.onDestroy()
  }

  // ───────────── Zpět ─────────────

  /** Zpět zavře visualizer / ekvalizér (window.__gridBack); jinak aplikaci jen schová – hudba hraje dál */
  private fun setupBack(webView: WebView) {
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("(window.__gridBack ? window.__gridBack() : false)") { handled ->
          if (handled != "true") moveTaskToBack(true)
        }
      }
    })
  }

  // ───────────── Most z webové části ─────────────

  /**
   * window.GridAndroid.postMessage(JSON) – jen z vlastní stránky aplikace (tauri.localhost, hlavní rám):
   *  { type: "state", playing, title, position, duration } → oznámení, zamykací obrazovka, hraní na pozadí
   *  { type: "immersive", on }                             → visualizer přes celou obrazovku (bez lišt)
   *  { type: "openWebsite" }                               → zazijvr.cz v prohlížeči (pevná adresa)
   */
  private fun setupBridge(webView: WebView) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    WebViewCompat.addWebMessageListener(
      webView,
      "GridAndroid",
      setOf("http://tauri.localhost", "https://tauri.localhost"),
    ) { _, message, _, isMainFrame, _ ->
      if (!isMainFrame) return@addWebMessageListener
      val msg = try { JSONObject(message.data ?: return@addWebMessageListener) } catch (e: Exception) { return@addWebMessageListener }
      when (msg.optString("type")) {
        "state" -> onState(msg)
        "immersive" -> applyImmersive(msg.optBoolean("on"))
        "openWebsite" -> openWebsite()
        else -> if (msg.optString("type").startsWith("alarms:")) onAlarmMessage(msg)
      }
    }
  }

  private fun onState(msg: JSONObject) {
    playing = msg.optBoolean("playing")
    if (playing) askNotificationPermission()
    MediaPlaybackService.update(
      this,
      msg.optString("title").take(200),
      playing,
      msg.optLong("position").coerceAtLeast(0),
      msg.optLong("duration").coerceAtLeast(0),
    )
  }

  /** Android 13+: oznámení s ovládáním potřebuje povolení – zeptat se při prvním přehrání */
  private fun askNotificationPermission() {
    if (askedNotifications || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    askedNotifications = true
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }
  }

  private fun applyImmersive(on: Boolean) {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    if (on) {
      controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      controller.show(WindowInsetsCompat.Type.systemBars())
    }
  }

  // ───────────── Budík (zprávy alarms:*) ─────────────

  /** Odpověď webové části: window.__gridAlarm(obj) */
  fun alarmReply(obj: JSONObject) {
    webView?.evaluateJavascript("window.__gridAlarm && window.__gridAlarm(${obj})", null)
  }

  private fun alarmStatus(): JSONObject {
    val fullScreen = if (Build.VERSION.SDK_INT >= 34) {
      getSystemService(android.app.NotificationManager::class.java).canUseFullScreenIntent()
    } else true
    return JSONObject()
      .put("exact", AlarmStore.canExact(this))
      .put("fullScreen", fullScreen)
      .put("notifications", NotificationManagerCompat.from(this).areNotificationsEnabled())
  }

  private fun alarmList(): JSONObject {
    val arr = JSONArray()
    val snoozes = AlarmStore.snoozes(this)
    AlarmStore.load(this).forEach { a ->
      arr.put(a.toJson().put("next", AlarmStore.nextTrigger(a) ?: JSONObject.NULL).put("snoozeUntil", snoozes[a.id] ?: JSONObject.NULL))
    }
    // Zvuky, které už jsou v úložišti budíku (aplikace je pak nemusí posílat znovu)
    val files = JSONArray()
    AlarmStore.audioDir(this).listFiles()?.filter { it.isFile && !it.name.endsWith(".part") }?.forEach { files.put(it.name) }
    return JSONObject().put("type", "list").put("alarms", arr).put("status", alarmStatus()).put("files", files)
  }

  private fun onAlarmMessage(msg: JSONObject) {
    when (msg.optString("type")) {
      "alarms:get" -> alarmWorker.execute { val r = alarmList(); runOnUiThread { alarmReply(r) } }
      "alarms:set" -> {
        val arr = msg.optJSONArray("alarms") ?: return
        val list = (0 until minOf(arr.length(), 50)).mapNotNull { i -> arr.optJSONObject(i)?.let { GridAlarm.fromJson(it) } }
        alarmWorker.execute {
          AlarmStore.replaceAll(this, list)
          val r = alarmList()
          runOnUiThread { alarmReply(r) }
        }
      }
      "alarms:file" -> saveAlarmChunk(msg)
      "alarms:cancelSnooze" -> {
        val id = msg.optString("id")
        alarmWorker.execute { AlarmStore.clearSnooze(this, id, true); val r = alarmList(); runOnUiThread { alarmReply(r) } }
      }
      "alarms:test" -> {
        val id = msg.optString("id")
        alarmWorker.execute { if (AlarmStore.get(this, id) != null) runOnUiThread { AlarmRingService.start(this, id) } }
      }
      "alarms:askNotifications" -> { askedNotifications = false; askNotificationPermission() }
      "alarms:openExact" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        openSettings(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
      }
      "alarms:openFullScreen" -> if (Build.VERSION.SDK_INT >= 34) {
        openSettings(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
      }
      "alarms:openNotifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        openSettings(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
      }
    }
  }

  private fun openSettings(intent: Intent) {
    try {
      startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
      startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  /**
   * Zvuk pro budík po kouscích (base64): { key, seq, total, data }. Ukládá se do alarm-audio/<key>.part,
   * po posledním kousku se přejmenuje na <key>. Hotovo → { type: "fileSaved", key }, chyba → "fileError".
   */
  private fun saveAlarmChunk(msg: JSONObject) {
    val key = msg.optString("key")
    val seq = msg.optInt("seq", -1)
    val total = msg.optInt("total", 0)
    if (!Regex("^[A-Za-z0-9_-]{1,64}$").matches(key) || seq < 0 || total <= 0 || seq >= total || total > 400) return
    val data = msg.optString("data")
    alarmWorker.execute {
      val dir = AlarmStore.audioDir(this)
      val part = File(dir, "$key.part")
      try {
        val bytes = Base64.decode(data, Base64.DEFAULT)
        if (seq == 0) part.delete()
        if (part.length() + bytes.size > 120L * 1024 * 1024) throw IllegalStateException("too big")
        part.appendBytes(bytes)
        if (seq == total - 1) {
          val target = File(dir, key)
          target.delete()
          if (!part.renameTo(target)) throw IllegalStateException("rename")
          runOnUiThread { alarmReply(JSONObject().put("type", "fileSaved").put("key", key)) }
        }
      } catch (e: Exception) {
        part.delete()
        runOnUiThread { alarmReply(JSONObject().put("type", "fileError").put("key", key)) }
      }
    }
  }

  private fun openWebsite() {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEBSITE)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
      // žádný prohlížeč – nic
    }
  }
}
