package com.prayer.pointfinder.feature.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import com.prayer.pointfinder.core.model.BaseStatus

/**
 * Creates a pin marker bitmap for map display.
 * Used by both PlayerMapScreen and OperatorMapScreen.
 *
 * @param colorInt The color (as an Int) for the marker
 * @param status The BaseStatus determining the icon to display
 * @param density The screen density for pixel scaling
 * @param isHidden Optional flag to add a dashed border (for OperatorMapScreen)
 */
fun createPinMarkerBitmap(colorInt: Int, status: BaseStatus, density: Float, isHidden: Boolean = false): Bitmap {
    // Target: 36dp circle + 6dp triangle, matching iOS BaseAnnotationView
    val circleDiameterPx = (36 * density).toInt()
    val triangleHeightPx = (6 * density).toInt()
    val shadowPx = (4 * density).toInt()
    val width = circleDiameterPx + shadowPx * 2
    // MapLibre Marker anchors at bitmap center. Size the bitmap so
    // the center coincides with the triangle tip, matching iOS behavior.
    val tipFromTop = circleDiameterPx + shadowPx + triangleHeightPx
    val height = tipFromTop * 2
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val cx = width / 2f
    val radius = circleDiameterPx / 2f
    val cy = radius + shadowPx

    val effectiveAlpha = if (isHidden) 180 else 255 // ~70% for hidden

    // Shadow
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        alpha = if (isHidden) 70 else 100
        maskFilter = android.graphics.BlurMaskFilter(shadowPx.toFloat(), android.graphics.BlurMaskFilter.Blur.NORMAL)
    }
    canvas.drawCircle(cx, cy + shadowPx * 0.5f, radius, shadowPaint)

    // Main circle
    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        alpha = effectiveAlpha
        style = Paint.Style.FILL
    }
    canvas.drawCircle(cx, cy, radius, fillPaint)

    // Triangle pointer
    val triTop = cy + radius * 0.7f
    val triBottom = cy + radius + triangleHeightPx
    val triPath = android.graphics.Path().apply {
        moveTo(cx - radius * 0.35f, triTop)
        lineTo(cx, triBottom)
        lineTo(cx + radius * 0.35f, triTop)
        close()
    }
    canvas.drawPath(triPath, fillPaint)

    // Dashed white border for hidden bases
    if (isHidden) {
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            alpha = effectiveAlpha
            style = Paint.Style.STROKE
            strokeWidth = 2f * density
            pathEffect = android.graphics.DashPathEffect(floatArrayOf(6f * density, 4f * density), 0f)
        }
        canvas.drawCircle(cx, cy, radius - density, borderPaint)
    }

    // White icon — draw using unicode text for clean rendering
    val iconChar = if (isHidden) {
        "\u2298" // ⊘ circled-slash (eye-slash equivalent)
    } else {
        when (status) {
            BaseStatus.NOT_VISITED -> "\u25CB"   // ○ circle outline (mappin)
            BaseStatus.CHECKED_IN -> "\u2691"    // ⚑ flag
            BaseStatus.SUBMITTED -> "\u25F4"     // ◴ clock
            BaseStatus.COMPLETED -> "\u2713"     // ✓ checkmark
            BaseStatus.REJECTED -> "\u2717"      // ✗ xmark
        }
    }
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        alpha = effectiveAlpha
        textSize = radius * 0.95f
        textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val textBounds = android.graphics.Rect()
    textPaint.getTextBounds(iconChar, 0, iconChar.length, textBounds)
    canvas.drawText(iconChar, cx, cy + textBounds.height() / 2f, textPaint)

    return bitmap
}

/**
 * Creates a circle marker bitmap for team locations.
 */
fun createCircleMarkerBitmap(colorInt: Int, sizePx: Int = 48): Bitmap {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        style = Paint.Style.FILL
    }
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 3f, paint)
    val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 3f, border)
    return bitmap
}
