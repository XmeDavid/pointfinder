package com.prayer.pointfinder.feature.player

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

enum class ScanAnimationState { IDLE, SCANNING, SUCCESS }

// ---------------------------------------------------------------------------
// Particle model (generated once, stable across recompositions)
// ---------------------------------------------------------------------------

private data class ScanParticle(
    val angle: Float,       // radians
    val distance: Float,    // px — base orbit radius
    val size: Float,        // dp-ish dot diameter
    val speed: Float,       // relative speed multiplier
    val phaseOffset: Float, // 0..1 loop offset
)

private fun generateParticles(): List<ScanParticle> = (0 until 20).map {
    ScanParticle(
        angle       = (Math.random() * 2 * PI).toFloat(),
        distance    = (35 + Math.random() * 50).toFloat(),
        size        = (2 + Math.random() * 3).toFloat(),
        speed       = (0.4 + Math.random() * 0.8).toFloat(),
        phaseOffset = Math.random().toFloat(),
    )
}

// ---------------------------------------------------------------------------
// Main composable
// ---------------------------------------------------------------------------

/**
 * Animated NFC scan illustration — three states: IDLE, SCANNING, SUCCESS.
 *
 * Visual elements (all drawn on a Compose [Canvas]):
 *   - Three concentric breathing rings (sine-wave radius modulation)
 *   - Inner radial glow
 *   - Radar sweep (rotating dot trail)
 *   - 20 floating particles drifting outward in a loop
 *   - 12 compass tick marks (slow rotation)
 *
 * Center icon overlay (Material Icons):
 *   - IDLE    → LocationOn (mappin equivalent)
 *   - SCANNING → Nfc (wave equivalent)
 *   - SUCCESS  → Check
 *
 * On SUCCESS → burst animation: rings/particles scale outward and fade,
 * icon scales up with a spring feel.
 */
@Composable
fun AnimatedScanView(
    state: ScanAnimationState,
    modifier: Modifier = Modifier,
) {
    val primary = MaterialTheme.colorScheme.primary

    // --- Particles (stable, generated once) ---
    val particles = remember { generateParticles() }

    // --- Continuous time driver (milliseconds → seconds as Float) ---
    val infiniteTransition = rememberInfiniteTransition(label = "scan-time")
    // Wrap at 1 000 s so Float precision stays fine; the modular arithmetic
    // below handles the wrap transparently.
    val timeSec by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue  = 1_000f,
        animationSpec = infiniteRepeatable(
            animation  = tween(durationMillis = 1_000_000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "scan-time-val",
    )

    // --- Success burst state ---
    val burstScale   = remember { Animatable(1f) }
    val burstOpacity = remember { Animatable(1f) }

    // Icon scale for center circle
    var iconScale by remember { mutableStateOf(1f) }
    val iconScaleAnim = remember { Animatable(1f) }

    LaunchedEffect(state) {
        when (state) {
            ScanAnimationState.SUCCESS -> {
                // Burst rings outward + fade
                launch { burstScale.animateTo(2.2f, tween(700)) }
                launch { burstOpacity.animateTo(0f, tween(700)) }
                // Icon grows with overshoot feel
                launch {
                    iconScaleAnim.animateTo(1.4f, tween(300))
                }
            }
            ScanAnimationState.IDLE -> {
                burstScale.snapTo(1f)
                burstOpacity.snapTo(1f)
                iconScaleAnim.snapTo(1f)
            }
            ScanAnimationState.SCANNING -> {
                iconScaleAnim.animateTo(1.15f, tween(250))
            }
        }
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier,
    ) {
        // Canvas for rings, glow, sweep, particles, ticks
        Canvas(modifier = Modifier.matchParentSize()) {
            val cx = size.width / 2f
            val cy = size.height / 2f
            val t  = timeSec

            val speedMul     = if (state == ScanAnimationState.SCANNING) 2.5f else 1.0f
            val intensityMul = if (state == ScanAnimationState.SCANNING) 1.5f else 1.0f
            val burstF       = if (state == ScanAnimationState.SUCCESS) burstScale.value else 1f
            val burstO       = if (state == ScanAnimationState.SUCCESS) burstOpacity.value else 1f

            drawBreathingRings(cx, cy, t, speedMul, intensityMul, burstF, burstO, primary)
            drawInnerGlow(cx, cy, t, speedMul, intensityMul, burstF, burstO, primary)
            drawRadarSweep(cx, cy, t, speedMul, state, burstF, burstO, primary)
            drawParticles(cx, cy, t, speedMul, state, burstF, burstO, particles, primary)
            drawTickMarks(cx, cy, t, speedMul, state, burstF, burstO, primary)
        }

        // Center icon
        CenterIcon(state = state, iconScale = iconScaleAnim.value, primary = primary)
    }
}

// ---------------------------------------------------------------------------
// DrawScope helpers
// ---------------------------------------------------------------------------

private fun DrawScope.drawBreathingRings(
    cx: Float, cy: Float,
    t: Float,
    speedMul: Float, intensityMul: Float,
    burstF: Float, burstO: Float,
    primary: Color,
) {
    val baseRadii   = floatArrayOf(120f, 95f, 72f)
    val baseOpacities = floatArrayOf(0.06f, 0.10f, 0.15f)
    val lineWidths  = floatArrayOf(1.0f, 1.0f, 1.0f)
    val scanWidths  = floatArrayOf(2.0f, 2.0f, 2.0f)

    for (i in 0..2) {
        val phase  = (t * 0.3f * speedMul + i * 0.33f) * 2f * PI.toFloat()
        val breathe = sin(phase)
        val radius  = (baseRadii[i] + breathe * 6f * intensityMul) * burstF
        val opacity = (baseOpacities[i] + breathe * 0.04f * intensityMul) * burstO
        val lw      = if (speedMul > 1f) scanWidths[i] else lineWidths[i]

        if (opacity > 0f && radius > 0f) {
            drawCircle(
                color  = primary.copy(alpha = opacity.coerceIn(0f, 1f)),
                radius = radius,
                center = androidx.compose.ui.geometry.Offset(cx, cy),
                style  = Stroke(width = lw),
            )
        }
    }
}

private fun DrawScope.drawInnerGlow(
    cx: Float, cy: Float,
    t: Float,
    speedMul: Float, intensityMul: Float,
    burstF: Float, burstO: Float,
    primary: Color,
) {
    val pulse      = 0.5f + 0.5f * sin((t * 0.5f * speedMul) * 2f * PI.toFloat())
    val glowRadius = (90f + pulse * 10f) * burstF
    val opacity    = (0.04f + pulse * 0.06f * intensityMul) * burstO

    if (opacity > 0f && glowRadius > 0f) {
        drawCircle(
            color  = primary.copy(alpha = opacity.coerceIn(0f, 1f)),
            radius = glowRadius,
            center = androidx.compose.ui.geometry.Offset(cx, cy),
        )
    }
}

private fun DrawScope.drawRadarSweep(
    cx: Float, cy: Float,
    t: Float,
    speedMul: Float,
    state: ScanAnimationState,
    burstF: Float, burstO: Float,
    primary: Color,
) {
    val sweepSpeed = if (state == ScanAnimationState.SCANNING) 1.2f else 0.4f
    val sweepAngle = t * 2f * PI.toFloat() * sweepSpeed  // radians

    val dotSize = if (state == ScanAnimationState.SCANNING) 3f else 2f
    val dist    = 105f * burstF

    for (step in 0 until 20) {
        val frac  = step / 20f
        val angle = sweepAngle - frac * (PI / 2f).toFloat()  // 90-degree trail
        val x     = cx + cos(angle) * dist
        val y     = cy + sin(angle) * dist
        val alpha = (1f - frac) * (if (state == ScanAnimationState.SCANNING) 0.35f else 0.12f) * burstO

        if (alpha > 0f) {
            drawCircle(
                color  = primary.copy(alpha = alpha.coerceIn(0f, 1f)),
                radius = dotSize / 2f,
                center = androidx.compose.ui.geometry.Offset(x, y),
            )
        }
    }
}

private fun DrawScope.drawParticles(
    cx: Float, cy: Float,
    t: Float,
    speedMul: Float,
    state: ScanAnimationState,
    burstF: Float, burstO: Float,
    particles: List<ScanParticle>,
    primary: Color,
) {
    val stateOpacity = if (state == ScanAnimationState.SCANNING) 0.55f else 0.3f

    for (p in particles) {
        // Continuous phase loop via truncating remainder
        val phase = ((t * 0.08f * speedMul * p.speed + p.phaseOffset) % 1f + 1f) % 1f
        val currentAngle = p.angle + phase * PI.toFloat() * 0.6f
        val dist = (p.distance + phase * 35f) * burstF

        val x = cx + cos(currentAngle) * dist
        val y = cy + sin(currentAngle) * dist

        val normalized = dist / (130f * burstF.coerceAtLeast(0.001f))
        val fadeOpacity = min(1f, normalized * 2.5f) * (1f - normalized).coerceAtLeast(0f)
        val alpha = fadeOpacity * stateOpacity * burstO

        if (alpha > 0f) {
            drawCircle(
                color  = primary.copy(alpha = alpha.coerceIn(0f, 1f)),
                radius = p.size / 2f,
                center = androidx.compose.ui.geometry.Offset(x, y),
            )
        }
    }
}

private fun DrawScope.drawTickMarks(
    cx: Float, cy: Float,
    t: Float,
    speedMul: Float,
    state: ScanAnimationState,
    burstF: Float, burstO: Float,
    primary: Color,
) {
    // degrees/second: slow rotation; faster when scanning
    val tickRotRad = t * (4f * (if (state == ScanAnimationState.SCANNING) 3f else 1f)) * (PI / 180f).toFloat()
    val dist = 108f * burstF

    for (i in 0 until 12) {
        val angle   = i * (PI / 6f).toFloat() + tickRotRad
        val isMajor = i % 3 == 0
        val length  = if (isMajor) 8f else 5f
        val lw      = if (isMajor) 1.5f else 0.8f
        val alpha   = (if (isMajor) 0.25f else 0.1f) * burstO

        val outerX = cx + cos(angle) * dist
        val outerY = cy + sin(angle) * dist
        val innerX = cx + cos(angle) * (dist - length)
        val innerY = cy + sin(angle) * (dist - length)

        if (alpha > 0f) {
            drawLine(
                color       = primary.copy(alpha = alpha.coerceIn(0f, 1f)),
                start       = androidx.compose.ui.geometry.Offset(innerX, innerY),
                end         = androidx.compose.ui.geometry.Offset(outerX, outerY),
                strokeWidth = lw,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Center icon overlay
// ---------------------------------------------------------------------------

@Composable
private fun CenterIcon(
    state: ScanAnimationState,
    iconScale: Float,
    primary: Color,
) {
    val icon = when (state) {
        ScanAnimationState.SUCCESS  -> Icons.Default.Check
        ScanAnimationState.SCANNING -> Icons.Default.Nfc
        ScanAnimationState.IDLE     -> Icons.Default.LocationOn
    }
    val bgAlpha   = if (state == ScanAnimationState.SUCCESS) 0.25f else 0.10f
    val fillColor = if (state == ScanAnimationState.SUCCESS) primary else Color.Transparent
    val iconTint  = if (state == ScanAnimationState.SUCCESS) Color.White else primary

    Surface(
        shape = androidx.compose.foundation.shape.CircleShape,
        color = fillColor.copy(alpha = if (state == ScanAnimationState.SUCCESS) 1f else 0f),
        modifier = Modifier
            .size(72.dp)
            .scale(iconScale),
    ) {
        Box(contentAlignment = Alignment.Center) {
            // Background glow circle
            Surface(
                shape = androidx.compose.foundation.shape.CircleShape,
                color = primary.copy(alpha = bgAlpha),
                modifier = Modifier.size(72.dp),
            ) {}
            Icon(
                imageVector        = icon,
                contentDescription = null,
                tint               = iconTint,
                modifier           = Modifier.size(30.dp),
            )
        }
    }
}
