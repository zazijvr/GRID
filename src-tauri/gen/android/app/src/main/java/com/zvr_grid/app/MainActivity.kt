package com.zvr_grid.app

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
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
  }

  private var webView: WebView? = null
  /** Hraje hudba – WebView se pak při odchodu z aplikace neuspí */
  private var playing = false
  private var askedNotifications = false

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

  private fun openWebsite() {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(WEBSITE)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
      // žádný prohlížeč – nic
    }
  }
}
