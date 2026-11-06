package com.mcl.mcllendingapp.presentation.printables

import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.graphics.toArgb
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.mcl.mcllendingapp.domain.model.DocumentPreview
import com.mcl.mcllendingapp.ui.theme.AppDimensions
import com.mcl.mcllendingapp.util.documents.DocumentWebView
import com.mcl.mcllendingapp.util.documents.DocumentPreviewStyles

@Composable
fun DocumentPreview(preview: DocumentPreview, zoom: Int, grid: Boolean, generation: Int, onMeasured: (Boolean) -> Unit) {
    val context = LocalContext.current
    val view = remember { DocumentWebView.create(context) }
    val gridColor = MaterialTheme.colorScheme.outline.toArgb()
    val source = remember(preview.html, grid, gridColor) { DocumentPreviewStyles.decorate(preview.html, grid, gridColor) }
    val loadedSource = remember(view) { arrayOf("") }
    val currentZoom = remember(view) { intArrayOf(75) }
    val measuredSource = remember(view) { arrayOf("") }
    val measuredOverflow = remember(view) { booleanArrayOf(false) }
    LaunchedEffect(generation, source) { if (measuredSource[0] == source) onMeasured(measuredOverflow[0]) }
    DisposableEffect(view) { onDispose { loadedSource[0] = ""; measuredSource[0] = ""; view.stopLoading(); view.clearHistory(); view.destroy() } }
    AndroidView(factory = { view }, modifier = Modifier.fillMaxWidth().height(AppDimensions.documentPreviewHeight), update = { browser ->
        if (loadedSource[0] != source) {
            loadedSource[0] = source
            browser.settings.javaScriptEnabled = true
            browser.setInitialScale(zoom)
            currentZoom[0] = zoom
            browser.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                override fun onPageFinished(view: WebView, url: String?) {
                    view.evaluateJavascript(DocumentPreviewStyles.overflowScript(preview.heightMm)) {
                        if (loadedSource[0] != source) return@evaluateJavascript
                        view.settings.javaScriptEnabled = false
                        measuredSource[0] = source
                        measuredOverflow[0] = it == "true"
                        onMeasured(measuredOverflow[0])
                    }
                }
            }
            browser.loadDataWithBaseURL("https://mcl-document.invalid/", source, "text/html", "UTF-8", null)
        } else if (zoom != currentZoom[0]) {
            browser.zoomBy(zoom.toFloat() / currentZoom[0])
            currentZoom[0] = zoom
        }
    })
}
