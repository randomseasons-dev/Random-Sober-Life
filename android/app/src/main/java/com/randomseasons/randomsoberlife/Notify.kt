package com.randomseasons.randomsoberlife

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Daily summary: the UI hands over the journey numbers; an alarm fires once a day at the chosen time. */
object Notify {
    private const val DAY = 86_400_000.0
    private const val HOUR = 3_600_000.0
    const val ACTION = "com.randomseasons.randomsoberlife.DAILY"

    private fun prefs(c: Context) = c.getSharedPreferences("rsl_notify", Context.MODE_PRIVATE)
    private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun setConfig(c: Context, cfg: String) {
        val j = try { JSONObject(cfg) } catch (e: Exception) { return }
        val p = prefs(c)
        val e = p.edit().putString("cfg", cfg)
        // first ever config after the chosen time: start tomorrow instead of firing straight away
        if (p.getString("last", "").isNullOrEmpty() && nowMinutes() >= due(j)) e.putString("last", today())
        e.apply()
        schedule(c)
    }

    private fun due(j: JSONObject) = j.optInt("h", 8) * 60 + j.optInt("m", 0)
    private fun nowMinutes(): Int { val k = Calendar.getInstance(); return k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE) }

    private fun pending(c: Context): PendingIntent =
        PendingIntent.getBroadcast(c, 1, Intent(c, NotifyReceiver::class.java).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun schedule(c: Context) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val p = prefs(c)
        val j = try { JSONObject(p.getString("cfg", null) ?: return) } catch (e: Exception) { return }
        am.cancel(pending(c))
        if (!j.optBoolean("on", false)) return
        val k = Calendar.getInstance()
        k.set(Calendar.HOUR_OF_DAY, j.optInt("h", 8)); k.set(Calendar.MINUTE, j.optInt("m", 0))
        k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0)
        if (k.timeInMillis <= System.currentTimeMillis() || p.getString("last", "") == today()) k.add(Calendar.DAY_OF_YEAR, 1)
        val at = k.timeInMillis
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c))
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c))
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c))
        }
    }

    /** Alarm or boot: show today's summary if due and not shown yet, then plan the next one. */
    fun tick(c: Context) {
        val p = prefs(c)
        val j = try { JSONObject(p.getString("cfg", null) ?: return) } catch (e: Exception) { return }
        if (j.optBoolean("on", false) && nowMinutes() >= due(j) && p.getString("last", "") != today()) {
            p.edit().putString("last", today()).apply()
            show(c, j)
        }
        schedule(c)
    }

    private fun show(c: Context, j: JSONObject) {
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("daily", "Daily summary", NotificationManager.IMPORTANCE_DEFAULT))
        val (title, body) = summary(j)
        val open = PendingIntent.getActivity(c, 2, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, "daily") else @Suppress("DEPRECATION") Notification.Builder(c)
        val n = b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body)).setContentIntent(open).setAutoCancel(true).build()
        try { nm.notify(1, n) } catch (_: SecurityException) {}
    }

    private fun moneyBetween(r: DoubleArray, t0: Double, t1: Double): Double {
        if (t1 <= t0) return 0.0
        if (r.all { it == r[0] }) return (t1 - t0) / DAY * r[0]
        var sum = 0.0; var cur = t0; var guard = 0
        val k = Calendar.getInstance()
        while (cur < t1 && guard++ < 50000) {
            k.timeInMillis = cur.toLong()
            val wd = k.get(Calendar.DAY_OF_WEEK) - 1          // 0 = Sunday, like JS getDay()
            k.set(Calendar.HOUR_OF_DAY, 0); k.set(Calendar.MINUTE, 0); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0)
            k.add(Calendar.DAY_OF_YEAR, 1)
            val end = min(k.timeInMillis.toDouble(), t1)
            sum += (end - cur) / DAY * r[wd]
            cur = end
        }
        return sum
    }

    private fun fmtMoney(v: Double, f: JSONObject?): String {
        val d = f?.optInt("d", 2) ?: 2
        val pow = Math.pow(10.0, d.toDouble())
        val s = String.format(Locale.US, "%.${d}f", floor(v * pow) / pow)
        val int = s.substringBefore('.'); val frac = if (d > 0) s.substringAfter('.') else ""
        val grp = f?.optString("grp", ",") ?: ","
        val sb = StringBuilder()
        int.forEachIndexed { i, ch -> if (i > 0 && (int.length - i) % 3 == 0) sb.append(grp); sb.append(ch) }
        if (d > 0) sb.append(f?.optString("dec", ".") ?: ".").append(frac)
        return (f?.optString("pre", "") ?: "") + sb + (f?.optString("suf", "") ?: "")
    }

    private fun fmtDur(ms: Double): String {
        val days = ms / DAY
        if (ms < DAY) return "${floor(ms / HOUR).toInt()}h"
        if (days < 30) return "${floor(days).toInt()}d ${floor((ms % DAY) / HOUR).toInt()}h"
        val y = floor(days / 365.2425); val mo = floor((days - y * 365.2425) / 30.436875)
        val d = floor(days - y * 365.2425 - mo * 30.436875)
        return if (y > 0) "${y.toInt()}y ${mo.toInt()}mo" else "${mo.toInt()}mo ${d.toInt()}d"
    }

    private fun summary(j: JSONObject): Pair<String, String> {
        val n = System.currentTimeMillis().toDouble()
        val start = j.optDouble("start", n); val erased = j.optDouble("erased", 0.0)
        val streak = max(0.0, n - j.optDouble("streakStart", n))
        val total = max(0.0, n - start - erased)
        val ra = j.optJSONArray("rates")
        val r = DoubleArray(7) { i -> ra?.optDouble(i, 0.0) ?: 0.0 }
        val money = max(0.0, moneyBetween(r, start, n) - erased / DAY * r.average())
        var next = ""
        val miles = j.optJSONArray("miles")
        if (miles != null) for (i in 0 until miles.length()) {
            val m = miles.optJSONArray(i) ?: continue
            val d = m.optDouble(0) * DAY
            if (d > total) { next = " Next medal: ${m.optString(1)} in ${fmtDur(d - total)}."; break }
        }
        val title = "Day ${floor(total / DAY).toInt() + 1} of your sober journey"
        val body = "Sober ${fmtDur(total)} · ${fmtMoney(money, j.optJSONObject("fmt"))} saved · current streak ${fmtDur(streak)}.$next"
        return title to body
    }
}

class NotifyReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) { Notify.tick(c) }
}
