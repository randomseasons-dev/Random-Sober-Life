package com.randomseasons.randomsoberlife

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.app.NotificationManager
import android.content.ContentValues
import android.provider.MediaStore
import android.provider.Settings
import android.view.View
import java.io.File
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/** Hosts the shared UI (assets = ../../ui) in a WebView served from https://appassets.androidplatform.net. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private val host = "appassets.androidplatform.net"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor("#0d1512")
        window.navigationBarColor = Color.parseColor("#0d1512")
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0d1512"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(Bridge(), "RSL")
        web.webChromeClient = android.webkit.WebChromeClient()   // shows confirm() dialogs
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                val u = req.url
                if (u.host != host) return null
                var path = (u.path ?: "/").trimStart('/')
                if (path.isEmpty()) path = "index.html"
                return try {
                    val mime = when (path.substringAfterLast('.')) {
                        "html" -> "text/html"; "js" -> "application/javascript"; "css" -> "text/css"
                        "svg" -> "image/svg+xml"; "png" -> "image/png"; else -> "application/octet-stream"
                    }
                    WebResourceResponse(mime, "utf-8", assets.open(path))
                } catch (e: Exception) {
                    WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, ByteArrayInputStream(ByteArray(0)))
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (req.url.host == host) return false
                openExternal(req.url.toString()); return true
            }
        }
        setContentView(web)
        web.loadUrl("https://$host/index.html")
        // the notification permission is asked by the page once it has loaded (see askNotify)
    }

    // ---- notification permission: only asked while the window has focus (asking in onCreate left "Allow" untappable)
    private var askPending = false

    private fun askNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        if (!hasWindowFocus()) { askPending = true; return }
        askPending = false
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && askPending) web.postDelayed({ askNotifyPermission() }, 400)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        notifChanged()
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) notifChanged()
    }

    private fun notifChanged() { web.evaluateJavascript("window.__rslNotifChanged && window.__rslNotifChanged()", null) }

    private fun notifyAllowed(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()
    }

    private fun openNotifySettings() {
        try {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
    }

    // ---- backups
    private val reqSave = 11
    private val reqOpen = 12
    private var fileId = ""
    private var saveText = ""

    private fun fileDone(id: String, ok: Boolean, text: String?) {
        val js = "window.__rslFile(" + JSONObject.quote(id) + "," + ok + "," + (if (text == null) "null" else JSONObject.quote(text)) + ")"
        web.post { web.evaluateJavascript(js, null) }
    }

    /** Automatic backup to Download/Random Sober Life/Random Sober Life backup.json (kept after uninstall). */
    private fun autoBackup(text: String) {
        val prefs = getSharedPreferences("rsl", MODE_PRIVATE)
        val bytes = text.toByteArray(Charsets.UTF_8)
        if (Build.VERSION.SDK_INT < 29) {
            try { File(getExternalFilesDir(null), "Random Sober Life backup.json").writeBytes(bytes) } catch (_: Exception) {}
            return
        }
        val saved = prefs.getString("bkUri", null)
        if (saved != null) {
            try {
                val out = contentResolver.openOutputStream(Uri.parse(saved), "wt")
                if (out != null) { out.use { it.write(bytes) }; return }
            } catch (_: Exception) { }
        }
        try {
            val v = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, "Random Sober Life backup.json")
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/Random Sober Life")
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return
            contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
            prefs.edit().putString("bkUri", uri.toString()).apply()
        } catch (_: Exception) { }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        val id = fileId
        if (resultCode != RESULT_OK || uri == null) { fileDone(id, false, null); return }
        Thread {
            try {
                if (requestCode == reqSave) {
                    contentResolver.openOutputStream(uri, "wt")?.use { it.write(saveText.toByteArray(Charsets.UTF_8)) }
                    fileDone(id, true, null)
                } else if (requestCode == reqOpen) {
                    val t = contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
                    fileDone(id, t != null, t)
                }
            } catch (e: Exception) {
                fileDone(id, false, "Could not use that file: " + e.message)
            }
        }.start()
    }

    private fun openExternal(url: String) {
        if (!url.startsWith("https://")) return
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.__rslBack && window.__rslBack()) ? 'y' : 'n'") { r ->
            if (r?.contains("y") != true) moveTaskToBack(true)
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    inner class Bridge {
        private val prefs = getSharedPreferences("rsl", MODE_PRIVATE)

        @JavascriptInterface fun load(): String? = prefs.getString("state", null)
        @JavascriptInterface fun save(s: String) { prefs.edit().putString("state", s).apply() }
        @JavascriptInterface fun version(): String = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "" } catch (e: Exception) { "" }
        @JavascriptInterface fun openUrl(u: String) { runOnUiThread { openExternal(u) } }
        @JavascriptInterface fun askNotify() { runOnUiThread { askNotifyPermission() } }
        @JavascriptInterface fun notifyAllowed(): Boolean = this@MainActivity.notifyAllowed()
        @JavascriptInterface fun openNotifySettings() { runOnUiThread { this@MainActivity.openNotifySettings() } }
        @JavascriptInterface fun backupAuto(text: String) { Thread { autoBackup(text) }.start() }
        @JavascriptInterface fun backupSave(id: String, name: String, text: String) {
            runOnUiThread {
                fileId = id; saveText = text
                val i = Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, name)
                try { startActivityForResult(i, reqSave) } catch (e: Exception) { fileDone(id, false, "No file picker found.") }
            }
        }
        @JavascriptInterface fun backupOpen(id: String) {
            runOnUiThread {
                fileId = id
                val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                try { startActivityForResult(i, reqOpen) } catch (e: Exception) { fileDone(id, false, null) }
            }
        }
        @Suppress("DEPRECATION")
        @JavascriptInterface fun setBars(bg: String, light: Boolean) {
            runOnUiThread {
                try {
                    val c = Color.parseColor(bg)
                    window.statusBarColor = c; window.navigationBarColor = c; web.setBackgroundColor(c)
                    var f = window.decorView.systemUiVisibility
                    f = if (light) f or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else f and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
                    if (Build.VERSION.SDK_INT >= 26) f = if (light) f or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else f and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
                    window.decorView.systemUiVisibility = f
                } catch (_: Exception) { }
            }
        }
        @JavascriptInterface fun setNotify(cfg: String) { Notify.setConfig(this@MainActivity, cfg) }

        @JavascriptInterface
        fun http(id: String, method: String, url: String, body: String) {
            Thread {
                var status = 0
                var text: String
                try {
                    if (!(url.startsWith("https://ntfy.sh/"))) {
                        throw IllegalArgumentException("blocked url")
                    }
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.requestMethod = method
                    c.connectTimeout = 20000; c.readTimeout = 25000
                    c.setRequestProperty("User-Agent", "android:com.randomseasons.randomsoberlife:${version()} (sobriety counter)")
                    if (body.isNotEmpty()) {
                        c.doOutput = true
                        c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    }
                    status = c.responseCode
                    val st = if (status >= 400) c.errorStream else c.inputStream
                    text = st?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                    c.disconnect()
                } catch (e: Exception) {
                    text = e.toString()
                }
                val js = "window.__rslHttp(${JSONObject.quote(id)},$status,${JSONObject.quote(text)})"
                web.post { web.evaluateJavascript(js, null) }
            }.start()
        }
    }
}
