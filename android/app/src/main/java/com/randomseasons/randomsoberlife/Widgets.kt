package com.randomseasons.randomsoberlife

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Home-screen widgets. The UI hands over the journey snapshot (start, erased time, streak start, money rates, theme colours)
 * whenever it saves; the widgets count on from it by themselves, refreshed once a minute while the screen is on.
 */
object Widgets {
    private const val DAY = 86_400_000.0
    private const val HOUR = 3_600_000.0
    private const val MIN = 60_000.0
    const val TICK = "com.randomseasons.randomsoberlife.WIDGET_TICK"

    private enum class Kind { A, C, E, F, G }

    private val kinds = listOf(
        Triple(WidgetCounter::class.java, R.layout.widget_a, Kind.A),
        Triple(WidgetJourney::class.java, R.layout.widget_c, Kind.C),
        Triple(WidgetDashboard::class.java, R.layout.widget_e, Kind.E),
        Triple(WidgetJourneyQuote::class.java, R.layout.widget_f, Kind.F),
        Triple(WidgetDashboardQuote::class.java, R.layout.widget_g, Kind.G),
    )

    private fun prefs(c: Context) = c.getSharedPreferences("rsl_widget", Context.MODE_PRIVATE)

    fun setData(c: Context, data: String) {
        prefs(c).edit().putString("data", data).apply()
        refresh(c)
    }

    /** Redraw every placed widget, then keep (or stop) the once-a-minute refresh. */
    fun refresh(c: Context) {
        val am = AppWidgetManager.getInstance(c) ?: return
        val j = try { JSONObject(prefs(c).getString("data", null) ?: "") } catch (e: Exception) { null }
        var any = false
        for ((cls, layout, kind) in kinds) {
            val ids = try { am.getAppWidgetIds(ComponentName(c, cls)) } catch (e: Exception) { IntArray(0) }
            if (ids.isEmpty()) continue
            any = true
            val rv = try { build(c, layout, kind, j) } catch (e: Exception) { null } ?: continue
            for (id in ids) try { am.updateAppWidget(id, rv) } catch (_: Exception) {}
        }
        tick(c, any)
    }

    private fun tick(c: Context, on: Boolean) {
        val alarm = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(c, 21, Intent(c, WidgetTick::class.java).setAction(TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        alarm.cancel(pi)
        if (!on) return
        // RTC (not _WAKEUP): never wakes the phone; a missed minute is caught up when the screen turns on
        val next = (System.currentTimeMillis() / 60_000L + 1) * 60_000L + 500L
        alarm.setRepeating(AlarmManager.RTC, next, 60_000L, pi)
    }

    // ---------- colours ----------
    private class Pal(val bg: Int, val bgAlpha: Int, val text: Int, val muted: Int, val money: Int, val quote: Int,
                      val stat: Int, val fab: Int, val plus: Int, val line: Int)

    private fun pal(c: Context, j: JSONObject?): Pal {
        val col = j?.optJSONObject("col")
        fun pc(n: String, d: String): Int = try { Color.parseColor(col?.optString(n)?.takeIf { it.isNotBlank() } ?: d) } catch (e: Exception) { Color.parseColor(d) }
        val fab = pc("fab", "#d4705b")
        val style = j?.optString("style", "app") ?: "app"
        if (style == "clear") return Pal(Color.BLACK, 107, Color.WHITE, 0xBFFFFFFF.toInt(), 0xFFB8F0C4.toInt(), 0xFFFFE1B0.toInt(),
            0xFFFFD7A8.toInt(), fab, Color.WHITE, 0x40FFFFFF)
        if (style == "wall" && Build.VERSION.SDK_INT >= 31) {
            val night = (c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            fun sc(id: Int) = c.getColor(id)
            return if (night) Pal(sc(android.R.color.system_neutral1_900), 255, sc(android.R.color.system_neutral1_50), sc(android.R.color.system_neutral2_300),
                sc(android.R.color.system_accent1_200), sc(android.R.color.system_accent3_200), sc(android.R.color.system_accent2_200),
                sc(android.R.color.system_accent1_300), sc(android.R.color.system_accent1_900), sc(android.R.color.system_neutral2_700))
            else Pal(sc(android.R.color.system_neutral1_50), 255, sc(android.R.color.system_neutral1_900), sc(android.R.color.system_neutral2_600),
                sc(android.R.color.system_accent1_600), sc(android.R.color.system_accent3_600), sc(android.R.color.system_accent2_600),
                sc(android.R.color.system_accent1_600), Color.WHITE, sc(android.R.color.system_neutral2_200))
        }
        return Pal(pc("bg", "#233029"), 255, pc("text", "#ece6d8"), pc("muted", "#a3ad9c"), pc("money", "#9fd3a8"), pc("quote", "#e6c18f"),
            pc("stat", "#d9a679"), fab, Color.WHITE, pc("line", "#3d4840"))
    }

    // ---------- journey numbers (same maths as ui/core.js derive) ----------
    private class Now(val total: Double, val cur: Double, val longest: Double, val money: Double, val resets: Int,
                      val k: Int, val kr: Int, val next: String, val progress: Double)

    private fun numbers(j: JSONObject): Now {
        val n = System.currentTimeMillis().toDouble()
        val start = j.optDouble("start", n); val erased = j.optDouble("erased", 0.0)
        val total = max(0.0, n - start - erased)
        val cur = max(0.0, n - j.optDouble("streakStart", n))
        val ra = j.optJSONArray("rates")
        val r = DoubleArray(7) { i -> ra?.optDouble(i, 0.0) ?: 0.0 }
        val money = max(0.0, Notify.moneyBetween(r, start, n) - erased / DAY * r.average())
        val reached = max(j.optDouble("maxTotal", 0.0), total)
        val miles = j.optJSONArray("miles") ?: JSONArray()
        var k = -1; var kr = -1
        for (i in 0 until miles.length()) {
            val d = (miles.optJSONArray(i)?.optDouble(0) ?: 0.0) * DAY
            if (total >= d) k = i
            if (reached >= d) kr = i
        }
        val nx = miles.optJSONArray(k + 1)
        val next: String; val prog: Double
        if (nx != null) {
            val nd = nx.optDouble(0) * DAY
            val pd = if (k >= 0) (miles.optJSONArray(k)?.optDouble(0) ?: 0.0) * DAY else 0.0
            next = "Next medal: ${nx.optString(1)} in ${dur(nd - total)}"
            prog = if (nd > pd) ((total - pd) / (nd - pd)).coerceIn(0.0, 1.0) else 0.0
        } else { next = "Every medal earned. Keep going."; prog = 1.0 }
        return Now(total, cur, max(j.optDouble("sLong", 0.0), cur), money, j.optInt("sr", 0), k, kr, next, prog)
    }

    private fun dur(ms: Double): String {
        if (ms < HOUR) return "${floor(ms / MIN).toInt()}m"
        if (ms < DAY) return "${floor(ms / HOUR).toInt()}h ${floor((ms % HOUR) / MIN).toInt()}m"
        val days = ms / DAY
        if (days < 30) return "${floor(days).toInt()}d ${floor((ms % DAY) / HOUR).toInt()}h"
        val y = floor(days / 365.2425).toInt(); val mo = floor((days - y * 365.2425) / 30.436875).toInt()
        val d = floor(days - y * 365.2425 - mo * 30.436875).toInt()
        return if (y > 0) "${y}y ${mo}mo" else "${mo}mo ${d}d"
    }

    /** calendar years / months / days / hours of a duration ending now (port of ymdh in core.js) */
    private fun ymdh(ms: Double): IntArray {
        val T = System.currentTimeMillis()
        val end = Calendar.getInstance().apply { timeInMillis = T }
        val from = Calendar.getInstance().apply { timeInMillis = T - ms.toLong() }
        var y = end.get(Calendar.YEAR) - from.get(Calendar.YEAR)
        var m = end.get(Calendar.MONTH) - from.get(Calendar.MONTH)
        fun probe(): Calendar = (from.clone() as Calendar).apply { isLenient = true; set(Calendar.YEAR, from.get(Calendar.YEAR) + y); set(Calendar.MONTH, from.get(Calendar.MONTH) + m); timeInMillis }
        var p = probe()
        if (p.timeInMillis > T) { m--; p = probe() }
        while (m < 0) { m += 12; y-- }
        var rest = max(0L, T - p.timeInMillis).toDouble()
        val d = floor(rest / DAY).toInt(); rest -= d * DAY
        return intArrayOf(y, m, d, floor(rest / HOUR).toInt())
    }

    // ---------- quote / reflection of the day (same pick as the app: day number mod list length) ----------
    private fun quoteOfDay(c: Context, top: String, j: JSONObject): Pair<String, String> {
        val k = Calendar.getInstance()
        k.set(Calendar.HOUR_OF_DAY, 0); k.set(Calendar.MINUTE, 0); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0)
        val day = floor(k.timeInMillis / DAY + 0.5).toLong()
        val refl = top == "reflection"
        // the quote the app is showing: today's pick plus how far it was browsed today
        val off = if (j.optLong("oDay", -1) == day) j.optLong(if (refl) "rOff" else "qOff", 0) else 0L
        val p = prefs(c)
        val tag = "$day|$refl|$off|3"
        if (p.getString("qTag", "") == tag) return (p.getString("qText", "") ?: "") to (p.getString("qBy", "") ?: "")
        return try {
            val src = c.assets.open(if (refl) "reflections.js" else "quotes.js").use { it.readBytes().toString(Charsets.UTF_8) }
            val arr = JSONArray(src.substring(src.indexOf("=[") + 1, src.lastIndexOf(']') + 1))
            val n = arr.length()
            val it = arr.getJSONArray(((((day + off) % n) + n) % n).toInt())
            val out = if (refl) it.optString(1) to it.optString(0) else "“${it.optString(0)}”" to "— ${it.optString(1)}"
            p.edit().putString("qTag", tag).putString("qText", out.first).putString("qBy", out.second).apply()
            out
        } catch (e: Exception) { "" to "" }
    }

    // ---------- artwork ----------
    /** medal bitmap, a port of medalSvg (mode 0 = colour, 1 = black and white, 2 = locked) */
    private fun medal(j: JSONObject, i: Int, mode: Int): Bitmap {
        val s = 3f
        val bmp = Bitmap.createBitmap((48 * s).toInt(), (56 * s).toInt(), Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp); cv.scale(s, s)
        val all = j.optJSONArray("medals") ?: JSONArray()
        val arr = all.optJSONArray(i.coerceIn(0, max(0, all.length() - 1)))
        val col = IntArray(5) { idx -> try { Color.parseColor(arr?.optString(idx) ?: "#cccccc") } catch (e: Exception) { Color.GRAY } }
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        if (mode > 0) {
            val cm = ColorMatrix(); cm.setSaturation(0f)
            val b = if (mode == 1) .85f else .55f
            cm.postConcat(ColorMatrix().apply { setScale(b, b, b, if (mode == 2) .45f else 1f) })
            p.colorFilter = ColorMatrixColorFilter(cm)
        }
        fun poly(vararg xy: Float) = Path().apply { moveTo(xy[0], xy[1]); var q = 2; while (q < xy.size) { lineTo(xy[q], xy[q + 1]); q += 2 }; close() }
        p.style = Paint.Style.FILL
        p.color = col[0]; cv.drawPath(poly(12f, 0f, 21f, 0f, 28f, 18f, 19f, 18f), p)
        p.color = col[1]; cv.drawPath(poly(36f, 0f, 27f, 0f, 20f, 18f, 29f, 18f), p)
        p.shader = LinearGradient(8f, 20f, 40f, 52f, col[2], col[3], Shader.TileMode.CLAMP)
        cv.drawCircle(24f, 36f, 16f, p); p.shader = null
        p.style = Paint.Style.STROKE
        p.strokeWidth = 1.5f; p.color = col[3]; cv.drawCircle(24f, 36f, 16f, p)
        p.strokeWidth = 1f; p.color = col[4]; p.alpha = 140; cv.drawCircle(24f, 36f, 12.5f, p)
        if (i >= 12) { p.alpha = 204; p.pathEffect = DashPathEffect(floatArrayOf(2f, 3f), 0f); cv.drawCircle(24f, 36f, 17.5f, p); p.pathEffect = null }
        p.alpha = 255; p.style = Paint.Style.FILL; p.color = col[4]
        val pts = 5 + (if (i >= 9) 3 else if (i >= 4) 1 else 0)
        val big = 9.5f; val small = big * (if (pts > 5) .5f else .42f)
        val star = Path()
        for (q in 0 until pts * 2) {
            val a = -PI / 2 + q * PI / pts; val rr = if (q % 2 == 1) small else big
            val x = (24 + rr * cos(a)).toFloat(); val y = (36 + rr * sin(a)).toFloat()
            if (q == 0) star.moveTo(x, y) else star.lineTo(x, y)
        }
        star.close(); cv.drawPath(star, p)
        return bmp
    }

    // ---------- health tree (port of treeSvg in core.js: same seeds, same tree) ----------
    private class Mulberry(var a: Int) {
        fun next(): Double {
            a += 0x6D2B79F5
            var t = (a xor (a ushr 15)) * (1 or a)
            t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
            return (t xor (t ushr 14)).toUInt().toDouble() / 4294967296.0
        }
    }
    private class Leaf(val u: Double, val x: Double, val y: Double, val rot: Double, val s: Double, val sh: Int, val z: Double)
    private class Sk(val segs: List<DoubleArray>, val leaves: List<Leaf>, val grass: List<DoubleArray>)
    private val treeCov = doubleArrayOf(0.0, .1, .22, .36, .5, .64, .77, .88, .96, 1.0)
    private val sk: Sk by lazy {
        val r = Mulberry(7); val segs = ArrayList<DoubleArray>(); val pts = ArrayList<DoubleArray>()
        fun br(x: Double, y: Double, a: Double, len: Double, w: Double, d: Int) {
            val x2 = x + cos(a) * len; val y2 = y + sin(a) * len
            segs.add(doubleArrayOf(x, y, x2, y2, w))
            if (d <= 2) pts.add(doubleArrayOf(x2, y2, d.toDouble()))
            if (d == 0) return
            val n = 2 + (if (r.next() < 0.35) 1 else 0)
            for (k in 0 until n) {
                val na = a + (k - (n - 1) / 2.0) * (0.48 + r.next() * 0.22) + (r.next() - 0.5) * 0.22
                br(x2, y2, na, len * (0.7 + r.next() * 0.1), w * 0.64, d - 1)
            }
        }
        br(50.0, 102.0, -PI / 2, 23.0, 6.5, 5)
        val r2 = Mulberry(99); val leaves = ArrayList<Leaf>()
        for (p in pts) {
            val u = r2.next(); val n = if (p[2] == 0.0) 7 else 5
            for (k in 0 until n) {
                val a = r2.next() * PI * 2; val d = 1 + r2.next() * 5.5
                val x = p[0] + cos(a) * d; val y = p[1] + sin(a) * d * 0.85
                val rot = a * 180 / PI + (r2.next() - 0.5) * 60; val sc = 0.8 + r2.next() * 0.45
                val sh = floor(r2.next() * 4).toInt(); val z = r2.next()
                leaves.add(Leaf(u, x, y, rot, sc, sh, z))
            }
        }
        val sorted = leaves.sortedWith(compareBy<Leaf>({ it.sh }, { it.z }))
        val r3 = Mulberry(5); val grass = ArrayList<DoubleArray>()
        for (k in 0 until 18) { val gx = 12 + r3.next() * 76; val gh = 0.6 + r3.next() * 0.8; val gd = (r3.next() - 0.5) * 3; grass.add(doubleArrayOf(gx, gh, gd)) }
        Sk(segs, sorted, grass)
    }
    private fun mixC(a: String, b: String, t: Double): Int {
        val x = Color.parseColor(a); val y = Color.parseColor(b)
        fun ch(sh: Int) = Math.round(((x shr sh) and 255) * (1 - t) + ((y shr sh) and 255) * t).toInt()
        return Color.rgb(ch(16), ch(8), ch(0))
    }
    private val treeCache = HashMap<Int, Bitmap>()
    private fun tree(idx: Int): Bitmap {
        val i = idx.coerceIn(0, 9)
        treeCache[i]?.let { return it }
        val sc = 2f
        val bmp = Bitmap.createBitmap((116 * sc).toInt(), (108 * sc).toInt(), Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp); cv.scale(sc, sc); cv.translate(8f, -2f)
        val t = i / 9.0
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.style = Paint.Style.FILL; p.color = mixC("#8b7b5f", "#3f7f34", t)
        cv.drawOval(RectF(12f, 98f, 88f, 108f), p)
        p.style = Paint.Style.STROKE; p.strokeCap = Paint.Cap.ROUND
        p.strokeWidth = 1.1f; p.color = mixC("#7a8a40", "#5fb04a", t)
        for (g in sk.grass.take(Math.round(t * 18).toInt())) {
            cv.drawPath(Path().apply { moveTo(g[0].toFloat(), 104f); rQuadTo((g[2] / 2).toFloat(), -4f, g[2].toFloat(), (-5 * g[1]).toFloat()) }, p)
        }
        p.color = if (i == 0) Color.parseColor("#7d756a") else mixC("#6e5a46", "#4e3726", t)
        for (g in sk.segs) { p.strokeWidth = (g[4] * (if (i == 0) 0.85 else 1.0)).toFloat(); cv.drawLine(g[0].toFloat(), g[1].toFloat(), g[2].toFloat(), g[3].toFloat(), p) }
        val shades = intArrayOf(mixC("#8f9a4c", "#1f5a24", t), mixC("#a8b35c", "#2f7d2c", t), mixC("#bcc56e", "#45a03a", t), mixC("#d0d68a", "#74c653", t))
        val vein = mixC("#6f7a38", "#174419", t); val ls = 0.5 + 0.5 * t
        val leafPath = Path().apply { moveTo(0f, 0f); cubicTo(2f, -2.7f, 5.6f, -2.9f, 8.4f, 0f); cubicTo(5.6f, 2.9f, 2f, 2.7f, 0f, 0f); close() }
        val vis = sk.leaves.filter { it.u < treeCov[i] }
        p.strokeCap = Paint.Cap.BUTT
        for (l in vis) {
            cv.save(); cv.translate(l.x.toFloat(), l.y.toFloat()); cv.rotate(l.rot.toFloat()); val z = (l.s * ls).toFloat(); cv.scale(z, z)
            p.style = Paint.Style.FILL; p.color = shades[l.sh]; cv.drawPath(leafPath, p)
            p.style = Paint.Style.STROKE; p.color = vein; p.strokeWidth = .35f; cv.drawPath(leafPath, p)
            p.strokeWidth = .4f; p.alpha = 204; cv.drawLine(.6f, 0f, 7.4f, 0f, p); p.alpha = 255
            cv.restore()
        }
        fun dot(x: Double, y: Double, r: Float, fill: String, ring: String?) {
            p.style = Paint.Style.FILL; p.color = Color.parseColor(fill); cv.drawCircle(x.toFloat(), y.toFloat(), r, p)
            if (ring != null) { p.style = Paint.Style.STROKE; p.strokeWidth = .3f; p.color = Color.parseColor(ring); cv.drawCircle(x.toFloat(), y.toFloat(), r, p) }
        }
        if (i == 8) vis.filterIndexed { k, _ -> k % 9 == 4 }.forEach { dot(it.x + 2, it.y, 1.5f, "#fbe1ea", "#e9a9bc"); dot(it.x + 2, it.y, .5f, "#f0c04a", null) }
        if (i == 9) vis.filterIndexed { k, _ -> k % 11 == 5 }.forEach { dot(it.x + 1.5, it.y + 1.5, 2.5f, "#d6402f", "#9e2a1e"); dot(it.x + .8, it.y + .7, .75f, "#ff9d86", null) }
        treeCache[i] = bmp
        return bmp
    }

    private fun bar(progress: Double, track: Int, fill: Int): Bitmap {
        val w = 600; val h = 12
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp); val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = track; cv.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), 6f, 6f, p)
        val fw = (w * progress).toFloat()
        if (fw > 1f) { p.color = fill; cv.drawRoundRect(RectF(0f, 0f, max(fw, h.toFloat()), h.toFloat()), 6f, 6f, p) }
        return bmp
    }

    // ---------- building the views ----------
    private fun span(vararg parts: Pair<String, Int>): CharSequence {
        val b = SpannableStringBuilder()
        for ((t, c) in parts) { val s = b.length; b.append(t); b.setSpan(ForegroundColorSpan(c), s, b.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
        return b
    }

    private fun build(c: Context, layout: Int, kind: Kind, j: JSONObject?): RemoteViews {
        val rv = RemoteViews(c.packageName, layout)
        val pl = pal(c, j)
        rv.setInt(R.id.bg, "setColorFilter", pl.bg)
        rv.setInt(R.id.bg, "setImageAlpha", pl.bgAlpha)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val open = PendingIntent.getActivity(c, 10, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)
        rv.setOnClickPendingIntent(R.id.root, open)
        if (kind != Kind.A) {
            val quick = PendingIntent.getActivity(c, 11, Intent(c, QuickLogActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION), flags)
            rv.setOnClickPendingIntent(R.id.plus, quick)
            rv.setInt(R.id.plusBg, "setColorFilter", pl.fab)
            rv.setTextColor(R.id.plusTx, pl.plus)
        }
        fun tx(id: Int, t: CharSequence, color: Int) { rv.setTextViewText(id, t); rv.setTextColor(id, color) }

        if (j == null) {
            // no journey handed over yet: the app has not been opened since the widget was added
            when (kind) {
                Kind.A -> { tx(R.id.days, "–", pl.text); tx(R.id.sub, "OPEN THE APP", pl.muted); tx(R.id.money, "", pl.money) }
                Kind.C, Kind.F -> { tx(R.id.time, "Open Random Sober Life", pl.text); tx(R.id.line, "", pl.muted) }
                Kind.E, Kind.G -> { tx(R.id.money, "Open Random Sober Life", pl.text); tx(R.id.next, "", pl.muted) }
            }
            return rv
        }

        val n = numbers(j)
        val fmt = j.optJSONObject("fmt")
        val moneyTxt = Notify.fmtMoney(n.money, fmt)
        val medalBmp = if (n.k >= 0) medal(j, n.k, 0) else if (n.kr >= 0) medal(j, n.kr, 1) else medal(j, 0, 2)
        rv.setImageViewBitmap(R.id.medal, medalBmp)
        // health tree: current streak against the step days the app handed over (0, 1, 3, 7 ... 90)
        val steps = j.optJSONArray("tree") ?: JSONArray()
        var ti = 0
        for (q in 0 until steps.length()) if (n.cur >= (steps.optJSONArray(q)?.optDouble(0) ?: 0.0) * DAY) ti = q
        rv.setImageViewBitmap(R.id.tree, tree(ti))
        rv.setContentDescription(R.id.tree, "Health: " + (steps.optJSONArray(ti)?.optString(1) ?: ""))
        val unit = j.optString("unit", "drink").ifBlank { "drink" }
        val skipped = floor(n.total / DAY * j.optDouble("dpd", 0.0)).toLong()
        val skipTxt = if (j.optDouble("dpd", 0.0) > 0) "  ·  $skipped ${if (skipped == 1L) unit else if (unit == "glass") "glasses" else unit + "s"} skipped" else ""
        val t = ymdh(n.total)
        val timeLine = "${t[0]}y ${t[1]}m ${t[2]}d ${t[3]}h"
        val moneyLine = span("$moneyTxt saved" to pl.money, "  ·  " to pl.muted, "streak ${dur(n.cur)}" to pl.stat)
        fun ymdhCols() {
            val ids = intArrayOf(R.id.ny, R.id.nm, R.id.nd, R.id.nh)
            val labs = intArrayOf(R.id.ly, R.id.lm, R.id.ld, R.id.lh)
            for (q in 0..3) { tx(ids[q], t[q].toString(), pl.text); rv.setTextColor(labs[q], pl.muted) }
        }
        fun stats() = tx(R.id.stats, span("Current " to pl.text, dur(n.cur) to pl.stat, "   Longest " to pl.text, dur(n.longest) to pl.stat,
            "   Relapses " to pl.text, n.resets.toString() to pl.stat), pl.text)
        fun quote() {
            val (q, by) = quoteOfDay(c, j.optString("top", "quotes"), j)
            tx(R.id.quote, q, pl.quote); tx(R.id.by, by, pl.muted)
        }
        when (kind) {
            Kind.A -> {
                rv.setTextColor(R.id.lbl, pl.muted)
                tx(R.id.days, floor(n.total / DAY).toInt().toString(), pl.text)
                val h = floor((n.total % DAY) / HOUR).toInt()
                tx(R.id.sub, (if (floor(n.total / DAY).toInt() == 1) "DAY" else "DAYS") + " · $h HOUR" + (if (h == 1) "" else "S"), pl.muted)
                val whole = try { JSONObject(fmt?.toString() ?: "{}").put("d", 0) } catch (e: Exception) { fmt }
                tx(R.id.money, "${Notify.fmtMoney(n.money, whole)} saved", pl.money)
            }
            Kind.C -> {
                rv.setTextColor(R.id.lbl, pl.muted)
                tx(R.id.next, n.next.replace("Next medal: ", "Next: "), pl.muted)
                tx(R.id.time, timeLine, pl.text)
                tx(R.id.line, moneyLine, pl.text)
            }
            Kind.E -> {
                rv.setTextColor(R.id.lbl, pl.muted)
                ymdhCols()
                tx(R.id.money, span("$moneyTxt saved" to pl.money, skipTxt to pl.stat), pl.money)
                rv.setImageViewBitmap(R.id.bar, bar(n.progress, pl.line, pl.money))
                tx(R.id.next, n.next, pl.muted)
                stats()
            }
            Kind.F -> {
                quote()
                rv.setInt(R.id.sep, "setColorFilter", pl.line)
                tx(R.id.time, timeLine, pl.text)
                tx(R.id.line, moneyLine, pl.text)
            }
            Kind.G -> {
                rv.setTextColor(R.id.lbl, pl.muted)
                quote()
                ymdhCols()
                tx(R.id.money, span("$moneyTxt saved" to pl.money, skipTxt to pl.stat), pl.money)
                rv.setImageViewBitmap(R.id.bar, bar(n.progress, pl.line, pl.money))
                tx(R.id.next, n.next, pl.muted)
                stats()
            }
        }
        return rv
    }
}

/** shared behaviour of the five widget sizes (each needs its own class for the widget picker) */
open class SoberWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) { Widgets.refresh(c) }
    override fun onEnabled(c: Context) { Widgets.refresh(c) }
    override fun onDisabled(c: Context) { Widgets.refresh(c) }
    override fun onDeleted(c: Context, ids: IntArray) { Widgets.refresh(c) }
    override fun onAppWidgetOptionsChanged(c: Context, m: AppWidgetManager, id: Int, o: Bundle) { Widgets.refresh(c) }
}
class WidgetCounter : SoberWidget()
class WidgetJourney : SoberWidget()
class WidgetDashboard : SoberWidget()
class WidgetJourneyQuote : SoberWidget()
class WidgetDashboardQuote : SoberWidget()

/** the once-a-minute refresh */
class WidgetTick : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) { Widgets.refresh(c) }
}
