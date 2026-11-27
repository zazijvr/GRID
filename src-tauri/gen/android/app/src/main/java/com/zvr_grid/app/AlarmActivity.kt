package com.zvr_grid.app

import android.app.KeyguardManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.ComponentActivity
import java.lang.ref.WeakReference

/**
 * Zvonicí obrazovka budíku – i přes zamčený telefon a se zhasnutým displejem.
 * Jednoduché nativní rozhraní (bez WebView, aby naskočilo hned): čas, název budíku, co hraje,
 * tlačítka Odložit a Vypnout. Zvuk hraje AlarmRingService.
 */
class AlarmActivity : ComponentActivity() {

  companion object {
    const val EXTRA_START = "start_service"
    private const val NEON = 0xFF01DAF6.toInt()
    private const val PINK = 0xFFE425A5.toInt()
    private const val BG = 0xFF061026.toInt()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()

    val id = intent.getStringExtra(AlarmStore.EXTRA_ID)
    // Záložní cesta (služba se nespustila z pozadí): obrazovka už je vpředu, službu smí spustit
    if (intent.getBooleanExtra(EXTRA_START, false) && AlarmRingService.ringing == null && id != null) {
      AlarmRingService.start(this, id)
    }
    val alarm = AlarmRingService.ringing ?: id?.let { AlarmStore.get(this, it) }
    if (alarm == null) { finish(); return }
    AlarmRingService.screen = WeakReference(this)

    // Zpět budík nezastaví – je potřeba vybrat Odložit nebo Vypnout
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) { override fun handleOnBackPressed() {} })

    setContentView(buildUi(alarm))
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    window.statusBarColor = BG
    window.navigationBarColor = BG
  }

  private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

  private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false, glow: Boolean = false) = TextView(this).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    gravity = Gravity.CENTER
    if (bold) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    if (glow) setShadowLayer(dp(14f), 0f, 0f, color)
  }

  private fun button(label: String, solid: Boolean, onClick: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = true
    letterSpacing = 0.15f
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    setTextColor(if (solid) BG else NEON)
    background = GradientDrawable().apply {
      cornerRadius = dp(18f)
      if (solid) setColor(NEON) else { setColor(Color.TRANSPARENT); setStroke(dp(2f).toInt(), NEON) }
    }
    stateListAnimator = null
    setPadding(0, dp(18f).toInt(), 0, dp(18f).toInt())
    setOnClickListener { onClick() }
  }

  // ── Živé hodiny ──
  private val clockHandler = Handler(Looper.getMainLooper())
  private var clockView: TextView? = null
  private var dateView: TextView? = null
  private val czech = Locale("cs", "CZ")
  private val tickClock = object : Runnable {
    override fun run() {
      val now = Date()
      clockView?.text = SimpleDateFormat("H:mm", czech).format(now)
      dateView?.text = SimpleDateFormat("EEEE d. MMMM", czech).format(now)
      // další tik přesně na začátku příští vteřiny
      clockHandler.postDelayed(this, 1000L - System.currentTimeMillis() % 1000L)
    }
  }

  private fun buildUi(alarm: GridAlarm) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER_HORIZONTAL
    setBackgroundColor(BG)
    val pad = dp(24f).toInt()
    setPadding(pad, dp(40f).toInt(), pad, pad)
    val wrap = { LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT) }

    // Nahoře: BUDÍK · název, velké aktuální hodiny, datum
    val title = if (alarm.label.isNotEmpty()) "BUDÍK · ${alarm.label.uppercase(czech)}" else "BUDÍK"
    addView(text(title, 13f, PINK, bold = true).apply { letterSpacing = 0.35f; maxLines = 1 }, wrap())
    clockView = text("", 88f, NEON, bold = true, glow = true).apply { includeFontPadding = false; setPadding(0, dp(6f).toInt(), 0, 0) }
    addView(clockView, wrap())
    dateView = text("", 17f, 0xCCFFFFFF.toInt())
    addView(dateView, wrap())

    // Uprostřed: panáček kývající hlavou v neonovém spektru – jako úvodní animace GRIDu (vyplní volné místo)
    addView(AlarmMascotView(this@AlarmActivity), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f).apply {
      topMargin = dp(22f).toInt(); bottomMargin = dp(14f).toInt()
    })

    addView(text("♪ " + alarm.soundName(), 15f, 0xB3FFFFFF.toInt()).apply { maxLines = 1 }, wrap())

    val buttons = LinearLayout(this@AlarmActivity).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(10f).toInt(), 0, 0)
      val lp = { LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12f).toInt() } }
      addView(button(getString(R.string.alarm_snooze, alarm.snoozeMin), false) {
        AlarmRingService.command(this@AlarmActivity, AlarmRingService.ACTION_SNOOZE); finish()
      }, lp())
      addView(button(getString(R.string.alarm_dismiss), true) {
        AlarmRingService.command(this@AlarmActivity, AlarmRingService.ACTION_DISMISS); finish()
      }, lp())
    }
    addView(buttons, wrap())
  }

  override fun onStart() {
    super.onStart()
    clockHandler.post(tickClock)
  }

  override fun onStop() {
    clockHandler.removeCallbacks(tickClock)
    super.onStop()
  }

  override fun onDestroy() {
    if (AlarmRingService.screen?.get() === this) AlarmRingService.screen = null
    super.onDestroy()
  }
}
