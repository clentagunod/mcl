package com.mcl.mcllendingapp.util.documents

import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

class DocumentPrintController(private val context: Context) {
    private var webView: WebView? = null

    suspend fun print(artifact: DocumentArtifact) {
        val html = withContext(Dispatchers.IO) { File(artifact.path).readText() }
        withContext(Dispatchers.Main.immediate) {
            suspendCancellableCoroutine<Unit> { continuation ->
                val view = DocumentWebView.create(context)
                webView = view
                view.webViewClient = object : WebViewClient() {
                    private var started = false
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true

                    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                        if (request?.isForMainFrame == true && continuation.isActive) {
                            close()
                            continuation.resumeWithException(IllegalStateException(error?.description?.toString() ?: "Print document could not be loaded."))
                        }
                    }

                    override fun onPageFinished(view: WebView, url: String?) {
                        if (started || !continuation.isActive) return
                        started = true
                        view.settings.javaScriptEnabled = true
                        view.evaluateJavascript(DocumentPreviewStyles.overflowScript(artifact.heightMm)) { result ->
                            view.settings.javaScriptEnabled = false
                            if (!continuation.isActive) { close(); return@evaluateJavascript }
                            if (result == "true") {
                                close()
                                continuation.resumeWithException(IllegalArgumentException("Some selected documents exceed the paper size. Increase paper size, reduce font or margins, or shorten template text. HTML and Word retain all content."))
                                return@evaluateJavascript
                            }
                        try {
                            val original = view.createPrintDocumentAdapter(artifact.filename.substringBeforeLast('.'))
                            val adapter = object : PrintDocumentAdapter() {
                                override fun onStart() = original.onStart()
                                override fun onLayout(oldAttributes: PrintAttributes?, newAttributes: PrintAttributes?, cancellationSignal: CancellationSignal?,
                                    callback: LayoutResultCallback?, extras: Bundle?) = original.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras)
                                override fun onWrite(pages: Array<out PageRange>?, destination: ParcelFileDescriptor?, cancellationSignal: CancellationSignal?,
                                    callback: WriteResultCallback?) = original.onWrite(pages, destination, cancellationSignal, callback)
                                override fun onFinish() {
                                    original.onFinish()
                                    close()
                                    if (continuation.isActive) continuation.resume(Unit)
                                }
                            }
                            val attributes = PrintAttributes.Builder().setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .setMediaSize(PrintAttributes.MediaSize("mcl-custom", "Document " + artifact.widthMm + " × " + artifact.heightMm + " mm",
                                    (artifact.widthMm / 25.4 * 1000).roundToInt(), (artifact.heightMm / 25.4 * 1000).roundToInt()))
                                .setResolution(PrintAttributes.Resolution("mcl", "MCL", 300, 300)).build()
                            (context.getSystemService(Context.PRINT_SERVICE) as PrintManager).print(artifact.filename.substringBeforeLast('.'), adapter, attributes)
                        } catch (error: Exception) {
                            close()
                            if (continuation.isActive) continuation.resumeWithException(error)
                        }
                        }
                    }
                }
                continuation.invokeOnCancellation { view.post { close() } }
                view.loadDataWithBaseURL("https://mcl-document.invalid/", html, "text/html", "UTF-8", null)
            }
        }
    }

    fun close() {
        webView?.apply { stopLoading(); clearHistory(); destroy() }
        webView = null
    }
}
