package com.mcl.mcllendingapp.util.documents

import android.content.Context
import android.webkit.WebSettings
import android.webkit.WebView

object DocumentWebView {
    fun create(context: Context): WebView = WebView(context).apply {
        settings.javaScriptEnabled = false
        settings.domStorageEnabled = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.blockNetworkLoads = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.setSupportZoom(true)
    }
}
