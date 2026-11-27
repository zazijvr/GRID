package com.zvr_grid.app

import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.os.SystemClock
import android.view.View
import androidx.core.graphics.PathParser
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * Zvonicí obrazovka budíku: stejná scéna jako úvodní animace GRIDu (SplashScreen.tsx) –
 * panáček se sluchátky kývá hlavou do rytmu 120 BPM, kolem něj neonové kruhové spektrum,
 * které na každou dobu pulzne a vystřelí jiskry. Tvary panáčka = src/mascot/gridMascot.ts (HEAD_3Q),
 * pohyb = DancingMascot.tsx (grid-dm-nod). Barvy ZažijVR: neon #01daf6 → růžová #e425a5.
 */
class AlarmMascotView(context: Context) : View(context) {

  private companion object {
    const val BEAT_S = 0.5f
    const val BARS = 72
    const val NEON = 0xFF01DAF6.toInt()
    const val CORE = 0xFFD2FDFF.toInt()
    /** Tloušťka čar panáčka v souřadnicích SVG (jako DancingMascot: W = 3.4, jádro 0.36×) */
    const val W = 3.4f
    /** Výřez hlavy se sluchátky (DancingMascot headOnly: viewBox 40 -12 176 176) */
    const val VB_X = 40f
    const val VB_Y = -12f
    const val VB = 176f
    const val PIVOT_X = 128f
    const val PIVOT_Y = 132f

    fun path(d: String): Path = PathParser.createPathFromPathData(d)

    /** HEAD_3Q z gridMascot.ts */
    val HEAD = listOf(path("M78.4 54 A56 56 0 1 1 77.5 104"))
    val FACE: List<Path> = listOf(
      "M114 119 Q128 129 142 119",
      "M86 54 H168 Q186 54 186 72 V84 Q186 104 166 104 H148 Q140 104 136 97 Q128 86 120 97 Q116 104 108 104 H90 Q70 104 70 84 V72 Q70 54 86 54 Z",
      "M89 62 H166 Q178 62 178 73 V83 Q178 96 165 96 H149 Q143 96 140 91 Q128 76 116 91 Q113 96 107 96 H91 Q78 96 78 83 V73 Q78 62 89 62 Z",
    ).map { d -> path(d).apply { transform(Matrix().apply { setValues(floatArrayOf(0.94f, 0f, -6f, 0f, 1f, 0f, 0f, 0f, 1f)) }) } }
    val BAND = listOf(path("M68 54 C60 -4 190 -10 202 66"), path("M79 54 C74 12 180 6 191 66"))
    val CUPS = listOf(
      path("M181 96 A17 30 0 1 0 215 96 A17 30 0 1 0 181 96 Z"),
      path("M196 96 A9 21 0 1 0 214 96 A9 21 0 1 0 196 96 Z"),
      path("M196 66 V70"),
      path("M60 74 Q50 92 60 112"),
    )
    val ACCENT = listOf(path("M205 84 V108"))
  }

  private val density = resources.displayMetrics.density
  private val start = SystemClock.uptimeMillis()
  private val seeds = FloatArray(BARS) { Random.nextFloat() * 2f * PI.toFloat() }
  private val levels = FloatArray(BARS)

  private class Spark(var x: Float, var y: Float, var vx: Float, var vy: Float, var life: Float, val mix: Float)
  private val sparks = ArrayList<Spark>()
  private var lastBeat = -1
  private var lastFrame = 0L

  private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
  private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = NEON }
  private val sparkPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; color = NEON
  }
  private val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; color = NEON; alpha = 170
  }
  private val core = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; color = CORE; alpha = 230
  }

  init {
    // záře (shadowLayer, BlurMaskFilter) potřebuje softwarové vykreslování
    setLayerType(LAYER_TYPE_SOFTWARE, null)
  }

  /** Barva mezi neonem (0) a růžovou (1) – jako brandMix ve SplashScreen */
  private fun mix(t: Float, alpha: Int = 255): Int {
    val k = t.coerceIn(0f, 1f)
    val r = (1 + (228 - 1) * k).toInt()
    val g = (218 + (37 - 218) * k).toInt()
    val b = (246 + (165 - 246) * k).toInt()
    return (alpha shl 24) or (r shl 16) or (g shl 8) or b
  }

  private fun smooth(x: Float) = x * x * (3 - 2 * x)

  /** Kývnutí hlavou (grid-dm-nod): 0 → 16 % dolů a dopředu → 58 % lehký zákmit → 100 % zpět */
  private fun nod(phase: Float): FloatArray {
    // [úhel °, posun x, posun y] v souřadnicích SVG
    val p = phase
    return when {
      p < 0.16f -> { val k = smooth(p / 0.16f); floatArrayOf(-9f * k, -2f * k, 3f * k) }
      p < 0.58f -> { val k = smooth((p - 0.16f) / 0.42f); floatArrayOf(-9f + 10.5f * k, -2f + 2f * k, 3f - 4f * k) }
      else -> { val k = smooth((p - 0.58f) / 0.42f); floatArrayOf(1.5f * (1 - k), 0f, -1f * (1 - k)) }
    }
  }

  private fun drawPaths(canvas: Canvas, paths: List<Path>, width: Float) {
    glow.strokeWidth = width * 2.6f
    line.strokeWidth = width
    core.strokeWidth = width * 0.36f
    for (p in paths) canvas.drawPath(p, glow)
    for (p in paths) canvas.drawPath(p, line)
    for (p in paths) canvas.drawPath(p, core)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val w = width.toFloat()
    val h = height.toFloat()
    if (w < 10 || h < 10) return
    val now = SystemClock.uptimeMillis()
    val dt = if (lastFrame == 0L) 1f / 60f else ((now - lastFrame) / 1000f).coerceIn(0f, 0.1f)
    lastFrame = now

    val t = (now - start) / 1000f
    val beatIndex = (t / BEAT_S).toInt()
    val phase = (t % BEAT_S) / BEAT_S
    val kick = exp(-phase * 5f)
    val intro = min(1f, t / 0.6f)
    val m = min(w, h)
    val cx = w / 2f
    val cy = h / 2f
    val r = m * 0.26f * (1 + kick * 0.05f)

    // ── Kruhové spektrum (basy nahoře, zrcadlově) ──
    for (i in 0 until BARS) {
      val k = if (i < BARS / 2) i else BARS - 1 - i
      val low = 1f - k / (BARS / 2f)
      val target = intro * (0.15f + low * kick * 0.75f + 0.25f * (0.5f + 0.5f * sin(t * 6f + seeds[i])) * (0.4f + 0.6f * (1 - low)))
      levels[i] += (target - levels[i]) * 0.35f
    }
    barPaint.strokeWidth = max(2f * density, (2f * PI.toFloat() * r) / BARS * 0.45f)
    for (i in 0 until BARS) {
      val k = if (i < BARS / 2) i else BARS - 1 - i
      val a = -PI.toFloat() / 2f + ((i + 0.5f) / BARS) * 2f * PI.toFloat()
      val len = 6f * density + levels[i] * m * 0.16f
      val c = mix(k / (BARS / 2f))
      barPaint.color = mix(k / (BARS / 2f), 230)
      barPaint.setShadowLayer(10f * density, 0f, 0f, c)
      canvas.drawLine(cx + cos(a) * r, cy + sin(a) * r, cx + cos(a) * (r + len), cy + sin(a) * (r + len), barPaint)
    }
    // svítící kruh
    ringPaint.strokeWidth = 2f * density
    ringPaint.alpha = ((0.5f + kick * 0.5f) * 255).toInt()
    ringPaint.setShadowLayer(10f * density, 0f, 0f, NEON)
    canvas.drawCircle(cx, cy, max(1f, r - 4f * density), ringPaint)

    // ── Jiskry na každou dobu ──
    if (beatIndex != lastBeat && t > 0.3f) {
      lastBeat = beatIndex
      repeat(40) {
        val a = Random.nextFloat() * 2f * PI.toFloat()
        val sp = (80f + Random.nextFloat() * 160f) * density
        sparks.add(Spark(cx + cos(a) * r, cy + sin(a) * r, cos(a) * sp, sin(a) * sp, 1f, Random.nextFloat()))
      }
    }
    val iter = sparks.iterator()
    while (iter.hasNext()) {
      val s = iter.next()
      s.life -= dt * 1.2f
      if (s.life <= 0f) { iter.remove(); continue }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96f; s.vy *= 0.96f
      val c = mix(s.mix, (s.life * 255).toInt())
      sparkPaint.color = c
      sparkPaint.setShadowLayer(6f * density, 0f, 0f, c)
      canvas.drawCircle(s.x, s.y, 1.8f * density, sparkPaint)
    }

    // ── Panáček (hlava se sluchátky) uprostřed kruhu, kývá do rytmu ──
    val size = m * 0.34f * (0.7f + 0.3f * min(1f, t / 0.6f)) // „pop“ při zobrazení
    val scale = size / VB
    canvas.save()
    canvas.translate(cx - size / 2f, cy - size * 0.52f)
    canvas.scale(scale, scale)
    canvas.translate(-VB_X, -VB_Y)
    val n = nod(phase)
    canvas.save()
    canvas.translate(n[1], n[2])
    canvas.rotate(n[0], PIVOT_X, PIVOT_Y)
    glow.maskFilter = BlurMaskFilter(W * 1.2f, BlurMaskFilter.Blur.NORMAL)
    drawPaths(canvas, HEAD, W)
    drawPaths(canvas, FACE, W)
    drawPaths(canvas, BAND, W)
    drawPaths(canvas, CUPS, W)
    drawPaths(canvas, ACCENT, W * 1.4f)
    canvas.restore()
    canvas.restore()

    postInvalidateOnAnimation()
  }
}
