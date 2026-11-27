package com.zvr_grid.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle

/**
 * Přehrávání na pozadí. Zvuk hraje WebView v MainActivity; tahle služba:
 *  - drží aplikaci naživu se zhasnutou obrazovkou (foreground service typu mediaPlayback),
 *  - ukazuje oznámení a ovládání na zamykací obrazovce (MediaSession),
 *  - přijímá tlačítka sluchátek / Bluetooth / hodinek,
 *  - zastaví při vytažení sluchátek.
 * Audio focus (hovor, jiné aplikace) si NEBERE – ten řeší WebView sám. Vlastní žádost o focus
 * WebView umlčela (focus mu sebrala): přehrávání se hned zastavilo a pak hrálo bez zvuku.
 * Povely posílá zpět do aplikace přes MainActivity.sendMedia(). Není dostupná jiným aplikacím
 * (exported=false); akce z oznámení jdou přes explicitní PendingIntent.
 */
class MediaPlaybackService : Service() {

  companion object {
    private const val CHANNEL_ID = "playback"
    private const val NOTIFICATION_ID = 1
    private const val ACTION_PLAY = "com.zvr_grid.app.PLAY"
    private const val ACTION_PAUSE = "com.zvr_grid.app.PAUSE"
    private const val ACTION_NEXT = "com.zvr_grid.app.NEXT"
    private const val ACTION_PREV = "com.zvr_grid.app.PREV"

    // Poslední stav z aplikace
    private var title = ""
    private var playing = false
    private var positionMs = 0L
    private var durationMs = 0L

    @Volatile private var instance: MediaPlaybackService? = null

    /** Nový stav přehrávání z aplikace. Službu spustí jen při přehrávání (uživatel právě klepl). */
    fun update(context: Context, newTitle: String, isPlaying: Boolean, posMs: Long, durMs: Long) {
      title = newTitle
      playing = isPlaying
      positionMs = posMs
      durationMs = durMs
      val svc = instance
      if (svc != null) {
        svc.refresh()
      } else if (isPlaying) {
        ContextCompat.startForegroundService(context, Intent(context, MediaPlaybackService::class.java))
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, MediaPlaybackService::class.java))
    }
  }

  private lateinit var session: MediaSessionCompat
  /** Obrázek přehrávače v liště a na zamykací obrazovce – Android z něj bere pozadí i barvy ovladače */
  private val artwork: Bitmap? by lazy { BitmapFactory.decodeResource(resources, R.drawable.media_art) }
  private var noisyRegistered = false

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      // Vytažená sluchátka / odpojené Bluetooth → nehrát nahlas z reproduktoru
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) MainActivity.sendMedia("pause")
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this

    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      nm.createNotificationChannel(channel)
    }

    session = MediaSessionCompat(this, "GRID").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() = MainActivity.sendMedia("play")
        override fun onPause() = MainActivity.sendMedia("pause")
        override fun onSkipToNext() = MainActivity.sendMedia("next")
        override fun onSkipToPrevious() = MainActivity.sendMedia("prev")
        override fun onSeekTo(pos: Long) = MainActivity.sendMedia("seek:$pos")
        override fun onStop() = MainActivity.sendMedia("pause")
      })
      setSessionActivity(openAppIntent())
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PLAY -> MainActivity.sendMedia("play")
      ACTION_PAUSE -> MainActivity.sendMedia("pause")
      ACTION_NEXT -> MainActivity.sendMedia("next")
      ACTION_PREV -> MainActivity.sendMedia("prev")
    }
    refresh()
    return START_NOT_STICKY // bez aplikace (WebView) nemá smysl službu obnovovat
  }

  /** Oznámení, MediaSession a hlídání sluchátek podle aktuálního stavu */
  fun refresh() {
    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title.ifEmpty { "GRID" })
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Zažij VR GRID")
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
        .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
        .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artwork)
        .putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, artwork)
        .build(),
    )
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO,
        )
        .setState(if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED, positionMs, if (playing) 1f else 0f)
        .build(),
    )

    if (playing) {
      if (!noisyRegistered) {
        ContextCompat.registerReceiver(this, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        noisyRegistered = true
      }
    } else if (noisyRegistered) {
      unregisterReceiver(noisyReceiver)
      noisyRegistered = false
    }

    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun openAppIntent(): PendingIntent =
    PendingIntent.getActivity(
      this, 0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun actionIntent(action: String, code: Int): PendingIntent =
    PendingIntent.getService(
      this, code,
      Intent(this, MediaPlaybackService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun buildNotification(): Notification {
    val playPause = if (playing) {
      NotificationCompat.Action(android.R.drawable.ic_media_pause, getString(R.string.action_pause), actionIntent(ACTION_PAUSE, 2))
    } else {
      NotificationCompat.Action(android.R.drawable.ic_media_play, getString(R.string.action_play), actionIntent(ACTION_PLAY, 1))
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_grid) // silueta panáčka ve stavovém řádku
      .setLargeIcon(artwork)
      .setColor(0xFF01DAF6.toInt()) // neon ZažijVR
      .setColorized(true) // starší Androidy obarví celé oznámení podle obrázku / barvy
      .setContentTitle(title.ifEmpty { "GRID" })
      .setContentText("Zažij VR GRID")
      .setContentIntent(openAppIntent())
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // ovládání i na zamykací obrazovce
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setOngoing(playing)
      .addAction(NotificationCompat.Action(android.R.drawable.ic_media_previous, getString(R.string.action_prev), actionIntent(ACTION_PREV, 3)))
      .addAction(playPause)
      .addAction(NotificationCompat.Action(android.R.drawable.ic_media_next, getString(R.string.action_next), actionIntent(ACTION_NEXT, 4)))
      .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
      .build()
  }

  /** Aplikace odstraněná z přehledu aplikací → konec přehrávání i služby */
  override fun onTaskRemoved(rootIntent: Intent?) {
    MainActivity.sendMedia("pause")
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    instance = null
    if (noisyRegistered) {
      unregisterReceiver(noisyReceiver)
      noisyRegistered = false
    }
    session.isActive = false
    session.release()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
