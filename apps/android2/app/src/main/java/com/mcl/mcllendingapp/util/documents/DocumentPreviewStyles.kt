package com.mcl.mcllendingapp.util.documents

object DocumentPreviewStyles {
    fun overflowScript(heightMm: Double): String {
        val expected = heightMm / 25.4 * 96 + 3
        return "(function(){return Array.from(document.querySelectorAll('.sheet')).some(function(s){return s.getBoundingClientRect().height>" + expected + "||s.scrollWidth>s.clientWidth+2;});})()"
    }

    fun decorate(html: String, grid: Boolean, color: Int): String {
        if (!grid) return html
        val red = color shr 16 and 255
        val green = color shr 8 and 255
        val blue = color and 255
        val gridColor = "rgba($red,$green,$blue,0.2)"
        return html.replace("</head>", "<style>body{background-image:linear-gradient(" + gridColor +
            " 1px,transparent 1px),linear-gradient(90deg," + gridColor +
            " 1px,transparent 1px);background-size:10mm 10mm;padding:4mm}</style></head>")
    }
}
