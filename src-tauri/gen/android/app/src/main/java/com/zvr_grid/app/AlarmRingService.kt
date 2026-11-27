package com.zvr_grid.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Zvonění budíku – běží samostatně, nepotřebuje WebView ani spuštěnou aplikaci.
 * Pořadí zvuku: zvolená skladba / rádio → (rádio nezačne do 15 s nebo vypadne) záložní skladba →
 * systémový zvuk budíku. Hraje jako budík (hlasitost budíku, zazní i v tichém režimu), k tomu vibrace.
 * Bez reakce zvoní nejvýš 10 minut. Odložit / Vypnout: zvonicí obrazovka (AlarmActivity) nebo oznámení.
 */
class AlarmRingService : Service() {

  companion object {
    private const val CHANNEL_ID = "alarm"
    private const val NOTIFICATION_ID = 7
    private const val ACTION_START = "com.zvr_grid.app.ALARM_START"
    const val ACTION_SNOOZE = "com.zvr_grid.app.ALARM_SNOOZE"
    const val ACTION_DISMISS = "com.zvr_grid.app.ALARM_DISMISS"
    private const val RADIO_TIMEOUT_MS = 15_000L
    private const val MAX_RING_MS = 10 * 60_000L
    private const val RAMP_MS = 30_000L

    /** Právě zvonící budík (pro zvonicí obrazovku) */
    @Volatile var ringing: GridAlarm? = null
      private set
    /** Zvonicí obrazovka – zavře se, jakmile budík přestane zvonit */
    var screen: WeakReference<AlarmActivity>? = null

    fun start(context: Context, id: String) {
      val intent = Intent(context, AlarmRingService::class.java).setAction(ACTION_START).putExtra(AlarmStore.EXTRA_ID, id)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        // Android 12+ nemusí dovolit spustit službu z pozadí (budík bez povolení přesných budíků) –
        // zvonicí obrazovka se pak otevře přes oznámení a službu spustí sama
        notifyFallback(context, id)
      }
    }

    fun command(context: Context, action: String) {
      context.startService(Intent(context, AlarmRingService::class.java).setAction(action))
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) != null) return
      val ch = NotificationChannel(CHANNEL_ID, context.getString(R.string.alarm_channel), NotificationManager.IMPORTANCE_HIGH)
      ch.setSound(null, null) // zvuk hraje služba sama
      ch.enableVibration(false)
      ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      nm.createNotificationChannel(ch)
    }

    fun screenIntent(context: Context, id: String, startService: Boolean): PendingIntent =
      PendingIntent.getActivity(
        context, if (startService) 11 else 10,
        Intent(context, AlarmActivity::class.java)
          .putExtra(AlarmStore.EXTRA_ID, id)
          .putExtra(AlarmActivity.EXTRA_START, startService)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

    private fun notifyFallback(context: Context, id: String) {
      ensureChannel(context)
      val alarm = AlarmStore.get(context, id)
      val n = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_grid)
        .setContentTitle(alarm?.label?.ifEmpty { null } ?: context.getString(R.string.alarm_title))
        .setContentText(context.getString(R.string.alarm_tap))
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setFullScreenIntent(screenIntent(context, id, true), true)
        .setContentIntent(screenIntent(context, id, true))
        .setAutoCancel(true)
        .build()
      try {
        context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, n)
      } catch (e: SecurityException) { /* oznámení zakázaná */ }
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var focusRequest: AudioFocusRequest? = null
  private var alarm: GridAlarm? = null
  /** 0 = hlavní zvuk, 1 = záložní skladba, 2 = systémový zvuk, 3 = jen vibrace */
  private var stage = 0
  private var volume = 1f
  private var stopped = false
  /** Playlist: která skladba hraje (dokola) */
  private var playlistIndex = 0

  private val attrs = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
    .build()

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val id = intent.getStringExtra(AlarmStore.EXTRA_ID)
        val a = id?.let { AlarmStore.get(this, it) }
        if (a == null) { stopSelf(); return START_NOT_STICKY }
        begin(a)
      }
      ACTION_SNOOZE -> {
        alarm?.let { AlarmStore.scheduleSnooze(this, it) }
        finish()
      }
      ACTION_DISMISS -> finish()
      else -> if (alarm == null) stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun begin(a: GridAlarm) {
    // Už zvoní jiný budík → ten nový ho nahradí
    releasePlayer()
    alarm = a
    ringing = a
    stopped = false
    ensureChannel(this)
    val notification = buildNotification(a)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    val pm = getSystemService(PowerManager::class.java)
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GRID:alarm").apply { acquire(MAX_RING_MS + 60_000L) }

    // Hudba v GRIDu se při zvonění zastaví (aby nehrály dvě věci najednou)
    MainActivity.sendMedia("pause")
    requestFocus()
    startVibration()

    volume = if (a.ramp) 0.15f else 1f
    stage = when (a.source) {
      "radio", "track", "playlist" -> 0
      else -> 2
    }
    playlistIndex = 0
    playStage()
    if (a.ramp) handler.post(rampStep)
    handler.postDelayed({ finish() }, MAX_RING_MS)

    // Zvonicí obrazovka (na zamčeném telefonu ji spustí oznámení samo – fullScreenIntent)
    try {
      startActivity(Intent(this, AlarmActivity::class.java).putExtra(AlarmStore.EXTRA_ID, a.id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) { /* z pozadí nemusí jít – stačí oznámení */ }
    MainActivity.notifyAlarmsChanged()
  }

  private val rampStep = object : Runnable {
    override fun run() {
      if (stopped) return
      volume = (volume + 0.85f / (RAMP_MS / 1000f)).coerceAtMost(1f)
      player?.setVolume(volume, volume)
      if (volume < 1f) handler.postDelayed(this, 1000)
    }
  }

  private val radioTimeout = Runnable { if (stage == 0 && alarm?.source == "radio") nextStage() }

  private fun nextStage() {
    stage++
    playStage()
  }

  /** Spustí zvuk podle stage; když se nepovede, posune se na další */
  private fun playStage() {
    if (stopped) return
    val a = alarm ?: return
    releasePlayer()
    handler.removeCallbacks(radioTimeout)
    when (stage) {
      0 -> when (a.source) {
        "radio" -> if (a.radioUrl.isNotEmpty()) playRadio(a.radioUrl) else nextStage()
        "track" -> AlarmStore.audioFile(this, a.trackFile)?.let { playUri(Uri.fromFile(it)) } ?: nextStage()
        "playlist" -> playPlaylist(a, 0)
        else -> nextStage()
      }
      1 -> AlarmStore.audioFile(this, a.backupFile)?.let { playUri(Uri.fromFile(it)) } ?: nextStage()
      2 -> systemAlarmUri()?.let { playUri(it) } ?: nextStage()
      else -> Unit // zbývá vibrace
    }
  }

  private fun systemAlarmUri(): Uri? =
    RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: Settings.System.DEFAULT_ALARM_ALERT_URI
      ?: RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)

  private fun newPlayer(): MediaPlayer = MediaPlayer().apply {
    setAudioAttributes(attrs)
    setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
    setOnErrorListener { _, _, _ -> handler.post { nextStage() }; true }
  }

  private fun playUri(uri: Uri) {
    try {
      player = newPlayer().apply {
        setDataSource(applicationContext, uri)
        isLooping = true
        prepare()
        setVolume(volume, volume)
        start()
      }
    } catch (e: Exception) {
      nextStage()
    }
  }

  /** Skladby playlistu postupně (dokola). Chybějící / nečitelné přeskočí; když nehraje žádná → záloha. */
  private fun playPlaylist(a: GridAlarm, tried: Int) {
    val files = a.playlistFiles
    if (files.isEmpty() || tried >= files.size) { nextStage(); return }
    val file = AlarmStore.audioFile(this, files[playlistIndex % files.size])
    if (file == null) { playlistIndex++; playPlaylist(a, tried + 1); return }
    try {
      player = newPlayer().apply {
        // Chyba u jedné skladby → další skladba (ne rovnou záloha)
        setOnErrorListener { _, _, _ ->
          handler.post { releasePlayer(); playlistIndex++; playPlaylist(a, tried + 1) }; true
        }
        setOnCompletionListener {
          handler.post { if (!stopped) { releasePlayer(); playlistIndex++; playPlaylist(a, 0) } }
        }
        setDataSource(applicationContext, Uri.fromFile(file))
        prepare()
        setVolume(volume, volume)
        start()
      }
    } catch (e: Exception) {
      releasePlayer(); playlistIndex++; playPlaylist(a, tried + 1)
    }
  }

  private fun playRadio(url: String) {
    try {
      wifiLock = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
        .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "GRID:alarm-radio").apply { acquire() }
    } catch (e: Exception) { /* bez Wi-Fi zámku */ }
    try {
      player = newPlayer().apply {
        setDataSource(url)
        setOnPreparedListener { mp ->
          handler.removeCallbacks(radioTimeout)
          mp.setVolume(volume, volume)
          mp.start()
        }
        // Živé vysílání skončilo / spadlo → záloha
        setOnCompletionListener { handler.post { nextStage() } }
        prepareAsync()
      }
      handler.postDelayed(radioTimeout, RADIO_TIMEOUT_MS)
    } catch (e: Exception) {
      nextStage()
    }
  }

  private fun requestFocus() {
    val am = getSystemService(AudioManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attrs)
        .setOnAudioFocusChangeListener { }
        .build()
        .also { am.requestAudioFocus(it) }
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) getSystemService(VibratorManager::class.java)?.defaultVibrator
    else @Suppress("DEPRECATION") (getSystemService(VIBRATOR_SERVICE) as? Vibrator)

  private fun startVibration() {
    val v = vibrator() ?: return
    val pattern = longArrayOf(0, 600, 900)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs)
    else @Suppress("DEPRECATION") v.vibrate(pattern, 0)
  }

  private fun buildNotification(a: GridAlarm): Notification {
    val snooze = PendingIntent.getService(
      this, 1, Intent(this, AlarmRingService::class.java).setAction(ACTION_SNOOZE),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val dismiss = PendingIntent.getService(
      this, 2, Intent(this, AlarmRingService::class.java).setAction(ACTION_DISMISS),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val time = String.format("%d:%02d", a.hour, a.minute)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_grid)
      .setColor(0xFF01DAF6.toInt())
      .setContentTitle(a.label.ifEmpty { getString(R.string.alarm_title) } + " · " + time)
      .setContentText(a.soundName())
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setFullScreenIntent(screenIntent(this, a.id, false), true)
      .setContentIntent(screenIntent(this, a.id, false))
      .addAction(0, getString(R.string.alarm_snooze, a.snoozeMin), snooze)
      .addAction(0, getString(R.string.alarm_dismiss), dismiss)
      .build()
  }

  private fun releasePlayer() {
    handler.removeCallbacks(radioTimeout)
    player?.let { try { it.stop() } catch (e: Exception) { }; it.release() }
    player = null
    wifiLock?.let { if (it.isHeld) it.release() }
    wifiLock = null
  }

  private fun finish() {
    if (stopped) return
    stopped = true
    handler.removeCallbacksAndMessages(null)
    releasePlayer()
    vibrator()?.cancel()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION") getSystemService(AudioManager::class.java).abandonAudioFocus(null)
    }
    wakeLock?.let { if (it.isHeld) it.release() }
    ringing = null
    alarm = null
    screen?.get()?.finish()
    screen = null
    MainActivity.notifyAlarmsChanged()
    stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    if (!stopped) finish()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
