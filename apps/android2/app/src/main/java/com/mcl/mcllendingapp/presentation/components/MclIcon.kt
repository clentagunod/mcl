package com.mcl.mcllendingapp.presentation.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.mcl.mcllendingapp.ui.theme.AppDimensions

private val paths=mapOf(
    "dashboard" to "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "clients" to "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "documents" to "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
    "wallet" to "M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6 M20 12h-5v5h5 M16 14.5h.01",
    "more" to "M3 6h18 M3 12h18 M3 18h18",
    "back" to "M15 18l-6-6 6-6",
    "refresh" to "M3 11a9 9 0 1 1 2.4 7 M3 4v7h7",
    "theme" to "M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8"
)
@Composable
fun MclIcon(name:String,label:String?=null,modifier:Modifier=Modifier){
    val path=remember(name){PathParser().parsePathString(paths[name]?:paths.getValue("more")).toPath()}
    val color=MaterialTheme.colorScheme.onSurface
    Canvas(modifier.size(AppDimensions.icon).semantics{if(label!=null)contentDescription=label}){
        scale(size.width/24f,size.height/24f,pivot=androidx.compose.ui.geometry.Offset.Zero){
            drawPath(path,color,style=Stroke(width=1.7f,cap=StrokeCap.Round,join=StrokeJoin.Round))
        }
    }
}
