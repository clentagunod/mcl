package com.mcl.mcllendingapp.util

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import org.json.JSONTokener
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class LegacyReceiptReader {
    @SuppressLint("SetJavaScriptEnabled")
    suspend fun read(context:Context,uid:String):Map<String,String> = withContext(Dispatchers.Main.immediate) {
        withTimeout(15_000) {
            suspendCancellableCoroutine { continuation ->
                val view=WebView(context)
                view.settings.javaScriptEnabled=true
                view.settings.domStorageEnabled=true
                view.settings.allowFileAccess=false
                view.settings.allowContentAccess=false
                view.settings.blockNetworkLoads=true
                continuation.invokeOnCancellation{view.post{view.destroy()}}
                view.webViewClient=object:WebViewClient(){
                    override fun onPageFinished(webView:WebView,url:String?){
                        val prefix=JSONObject.quote("mcl-pending-$uid-")
                        val script="(function(){var out={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf("+prefix+")===0)out[k]=localStorage.getItem(k);}return JSON.stringify(out);})()"
                        webView.evaluateJavascript(script){value->
                            if(!continuation.isActive){webView.destroy();return@evaluateJavascript}
                            runCatching{
                                val raw=JSONTokener(value).nextValue() as? String ?: "{}"
                                val json=JSONObject(raw)
                                buildMap<String,String>{json.keys().forEach{key->put(key,json.getString(key))}}
                            }.onSuccess{continuation.resume(it)}.onFailure{continuation.resumeWithException(it)}
                            webView.destroy()
                        }
                    }
                }
                view.loadDataWithBaseURL("https://appassets.androidplatform.net/assets/mobile/index.html","<html><body></body></html>","text/html","UTF-8",null)
            }
        }
    }
}
