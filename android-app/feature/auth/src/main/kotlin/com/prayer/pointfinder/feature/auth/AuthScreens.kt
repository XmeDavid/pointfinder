package com.prayer.pointfinder.feature.auth

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import kotlin.math.cos
import kotlin.math.sin

// Compass colours matching the web landing page
private val CompassGreen = Color(0xFF22C55E)
private val CompassGreenDark = Color(0xFF16A34A)
private val CompassGreenDeep = Color(0xFF0D5F2D)
private val CompassCenter = Color(0xFF060B06)

@Composable
fun CompassRose(modifier: Modifier = Modifier) {
    val infiniteTransition = rememberInfiniteTransition(label = "compass")

    // Slow rotation: 360° in 120 seconds
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 120_000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "rotation",
    )

    // Three sonar pulse rings staggered by 1.5s within a 4s cycle
    val pulse0 by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(4000, easing = LinearEasing), RepeatMode.Restart),
        label = "pulse0",
    )
    val pulse1 by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(4000, easing = LinearEasing),
            RepeatMode.Restart,
            initialStartOffset = androidx.compose.animation.core.StartOffset(1500),
        ),
        label = "pulse1",
    )
    val pulse2 by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(4000, easing = LinearEasing),
            RepeatMode.Restart,
            initialStartOffset = androidx.compose.animation.core.StartOffset(3000),
        ),
        label = "pulse2",
    )

    Canvas(
        modifier = modifier
            .aspectRatio(1f)
            .fillMaxWidth(),
    ) {
        val cx = size.width / 2f
        val cy = size.height / 2f
        val unit = size.width / 200f // scale factor (viewBox 200×200)

        // ── Sonar pulse rings ──
        for (p in listOf(pulse0, pulse1, pulse2)) {
            val scale = 1f + p * 1.2f
            val alpha = (0.25f * (1f - p)).coerceAtLeast(0f)
            drawCircle(
                color = CompassGreen,
                radius = cx * scale,
                center = Offset(cx, cy),
                style = Stroke(width = 1.dp.toPx()),
                alpha = alpha,
            )
        }

        // ── Glow ──
        drawCircle(
            color = CompassGreen,
            radius = cx * 1.5f,
            center = Offset(cx, cy),
            alpha = 0.04f,
        )

        // Rotate the compass SVG content
        rotate(degrees = rotation, pivot = Offset(cx, cy)) {
            // ── Outer rings ──
            drawCircle(CompassGreen, radius = 96f * unit, center = Offset(cx, cy), style = Stroke(0.5f * unit), alpha = 0.15f)
            drawCircle(CompassGreen, radius = 90f * unit, center = Offset(cx, cy), style = Stroke(0.4f * unit), alpha = 0.1f)

            // ── Tick marks (36 ticks, every 10°) ──
            for (i in 0 until 36) {
                val angle = Math.toRadians(i * 10.0)
                val isMajor = i % 9 == 0
                val isMinor = i % 3 == 0 && !isMajor
                val r1 = 90f * unit
                val r2 = (if (isMajor) 78f else if (isMinor) 83f else 86f) * unit
                val sw = (if (isMajor) 1.6f else if (isMinor) 0.8f else 0.4f) * unit
                val alpha = if (isMajor) 0.6f else if (isMinor) 0.3f else 0.15f
                drawLine(
                    color = CompassGreen,
                    start = Offset(cx + r1 * sin(angle).toFloat(), cy - r1 * cos(angle).toFloat()),
                    end = Offset(cx + r2 * sin(angle).toFloat(), cy - r2 * cos(angle).toFloat()),
                    strokeWidth = sw,
                    alpha = alpha,
                )
            }

            // ── Intercardinal diamond ──
            val diamondPath = Path().apply {
                moveTo(cx, cy - 42f * unit)
                lineTo(cx - 24f * unit, cy)
                lineTo(cx, cy + 42f * unit)
                lineTo(cx + 24f * unit, cy)
                close()
            }
            drawPath(diamondPath, color = CompassGreen, style = Stroke(0.5f * unit), alpha = 0.1f)

            // ── Rose petals ──
            // North (bright)
            drawPath(
                Path().apply { moveTo(cx, cy - 52f * unit); lineTo(cx - 7f * unit, cy); lineTo(cx + 7f * unit, cy); close() },
                color = CompassGreenDark, alpha = 0.85f,
            )
            drawPath(
                Path().apply { moveTo(cx, cy - 52f * unit); lineTo(cx, cy); lineTo(cx - 7f * unit, cy); close() },
                color = CompassGreen, alpha = 0.6f,
            )
            // South (dim)
            drawPath(
                Path().apply { moveTo(cx, cy + 52f * unit); lineTo(cx - 7f * unit, cy); lineTo(cx + 7f * unit, cy); close() },
                color = CompassGreenDark, alpha = 0.3f,
            )
            drawPath(
                Path().apply { moveTo(cx, cy + 52f * unit); lineTo(cx, cy); lineTo(cx + 7f * unit, cy); close() },
                color = CompassGreenDeep, alpha = 0.2f,
            )
            // East
            drawPath(
                Path().apply { moveTo(cx + 52f * unit, cy); lineTo(cx, cy - 7f * unit); lineTo(cx, cy + 7f * unit); close() },
                color = CompassGreenDark, alpha = 0.3f,
            )
            drawPath(
                Path().apply { moveTo(cx + 52f * unit, cy); lineTo(cx, cy); lineTo(cx, cy - 7f * unit); close() },
                color = CompassGreen, alpha = 0.2f,
            )
            // West
            drawPath(
                Path().apply { moveTo(cx - 52f * unit, cy); lineTo(cx, cy - 7f * unit); lineTo(cx, cy + 7f * unit); close() },
                color = CompassGreenDark, alpha = 0.3f,
            )
            drawPath(
                Path().apply { moveTo(cx - 52f * unit, cy); lineTo(cx, cy); lineTo(cx, cy + 7f * unit); close() },
                color = CompassGreen, alpha = 0.2f,
            )

            // ── Cardinal labels (N, S, E, W) ──
            fun DrawScope.drawCardinal(text: String, x: Float, y: Float, alpha: Float) {
                drawContext.canvas.nativeCanvas.apply {
                    val paint = android.graphics.Paint().apply {
                        color = android.graphics.Color.argb(
                            (alpha * 255).toInt(), 0x22, 0xC5, 0x5E,
                        )
                        textSize = 10f * unit
                        textAlign = android.graphics.Paint.Align.CENTER
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        isAntiAlias = true
                    }
                    drawText(text, x, y + 3.5f * unit, paint)
                }
            }
            drawCardinal("N", cx, cy - 60f * unit, 0.7f)
            drawCardinal("S", cx, cy + 70f * unit, 0.45f)
            drawCardinal("W", cx - 67f * unit, cy, 0.45f)
            drawCardinal("E", cx + 67f * unit, cy, 0.45f)

            // ── Centre dot ──
            drawCircle(CompassGreen, radius = 5f * unit, center = Offset(cx, cy), alpha = 0.8f)
            drawCircle(CompassCenter, radius = 2.5f * unit, center = Offset(cx, cy))
        }
    }
}

@Composable
fun WelcomeScreen(
    onJoinGame: () -> Unit,
    onOperatorLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(48.dp))

            Text(
                stringResource(R.string.label_welcome),
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )

            Spacer(Modifier.weight(1f))

            CompassRose(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            )

            Spacer(Modifier.weight(1f))

            Button(onClick = onJoinGame, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.GroupAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_join_game))
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onOperatorLogin, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.Login, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_operator_login))
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun PlayerJoinScreen(
    joinCode: String,
    canContinue: Boolean,
    onJoinCodeChange: (String) -> Unit,
    onContinue: () -> Unit,
    onScanQr: () -> Unit,
    cameraDenied: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(24.dp),
            verticalArrangement = Arrangement.Top,
        ) {
            Spacer(Modifier.height(36.dp))
            Text(
                stringResource(R.string.label_join_with_qr_or_code),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = onScanQr, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_scan_qr))
            }
            if (cameraDenied) {
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.error_camera_denied), color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = joinCode,
                onValueChange = { onJoinCodeChange(it.uppercase()) },
                label = { Text(stringResource(R.string.label_join_code)) },
                modifier = Modifier.fillMaxWidth().testTag("player-join-code-input"),
                singleLine = true,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onContinue,
                enabled = canContinue,
                modifier = Modifier.fillMaxWidth().testTag("player-join-btn"),
            ) {
                Text(stringResource(R.string.action_continue))
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun PlayerNameScreen(
    name: String,
    onNameChange: (String) -> Unit,
    onJoin: () -> Unit,
    isLoading: Boolean,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    stringResource(R.string.label_your_name),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    label = { Text(stringResource(R.string.label_display_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                if (!errorMessage.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(errorMessage, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onJoin,
                    enabled = name.trim().isNotBlank() && !isLoading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    } else {
                        Icon(Icons.Default.GroupAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.action_join_game))
                    }
                }
            }
        }
    }
}

@Composable
fun OperatorLoginScreen(
    email: String,
    password: String,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
    isLoading: Boolean,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = modifier.fillMaxSize(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            ) {
                Text(
                    stringResource(R.string.action_operator_login),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = onEmailChange,
                    label = { Text(stringResource(R.string.label_email)) },
                    modifier = Modifier.fillMaxWidth().testTag("login-email"),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = onPasswordChange,
                    label = { Text(stringResource(R.string.label_password)) },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth().testTag("login-password"),
                    singleLine = true,
                )
                if (!errorMessage.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(errorMessage, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("login-error"))
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onSignIn,
                    enabled = !isLoading && email.isNotBlank() && password.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().testTag("login-submit"),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    } else {
                        Icon(Icons.Default.Login, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.action_sign_in))
                    }
                }
            }
        }
    }
}
