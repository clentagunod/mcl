package com.mcl.mcllendingapp

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.webkit.*
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/** Hosts only the APK's bundled interface; Firebase traffic uses the web SDK over HTTPS. */
class MainActivity : ComponentActivity() {
    private var browser: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        setContent {
            var canGoBack by remember { mutableStateOf(false) }
            var failed by remember { mutableStateOf(false) }
            MaterialTheme(colorScheme = lightColorScheme()) {
                BackHandler(enabled = canGoBack) { browser?.goBack() }
                Scaffold(contentWindowInsets = WindowInsets.safeDrawing) { padding ->
                    Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding)) {
                        AndroidView(modifier = Modifier.fillMaxSize(), factory = { context ->
                            WebView(context).apply {
                                browser = this
                                settings.apply {
                                    javaScriptEnabled = true
                                    domStorageEnabled = true
                                    allowFileAccess = false
                                    allowContentAccess = false
                                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                    setSupportZoom(true)
                                    builtInZoomControls = true
                                    displayZoomControls = false
                                    useWideViewPort = true
                                    loadWithOverviewMode = true
                                    javaScriptCanOpenWindowsAutomatically = false
                                }
                                CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                                webViewClient = object : WebViewClient() {
                                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                                        val response = loader.shouldInterceptRequest(request.url)
                                        if (response != null) return response
                                        if (request.url.host == HOST) return WebResourceResponse(
                                            "text/plain", "UTF-8", 404, "Not Found", emptyMap(),
                                            ByteArrayInputStream(ByteArray(0)))
                                        return null
                                    }
                                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                        val uri = request.url
                                        if (uri.scheme == "https" && uri.host == HOST && uri.path?.startsWith("/assets/mobile/") == true) return false
                                        if (request.isForMainFrame && uri.scheme in setOf("https", "tel", "mailto")) {
                                            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                                        }
                                        return true
                                    }
                                    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                                        canGoBack = view.canGoBack()
                                    }
                                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                                        if (request.isForMainFrame) failed = true
                                    }
                                    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                                        // A dead renderer must never be reused.
                                        browser = null
                                        (view.parent as? android.view.ViewGroup)?.removeView(view)
                                        view.destroy()
                                        failed = true
                                        return true
                                    }
                                }
                                if (savedInstanceState == null || restoreState(savedInstanceState) == null) loadUrl(START_URL)
                            }
                        })
                        if (failed) Surface(Modifier.fillMaxSize()) {
                            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.Center) {
                                Text("Workspace could not open")
                                Text("Restart the workspace to try again. Reserved receipts remain available for retry.")
                                Button(onClick = { recreate() }) { Text("Restart workspace") }
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onPause() { browser?.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); browser?.onResume() }
    override fun onSaveInstanceState(outState: Bundle) {
        browser?.saveState(outState)
        super.onSaveInstanceState(outState)
    }
    override fun onDestroy() {
        browser?.apply { stopLoading(); (parent as? android.view.ViewGroup)?.removeView(this); destroy() }
        browser = null
        super.onDestroy()
    }
    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://appassets.androidplatform.net/assets/mobile/index.html"
    }
}
