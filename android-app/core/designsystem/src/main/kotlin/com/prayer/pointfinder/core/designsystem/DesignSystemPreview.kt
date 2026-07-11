package com.prayer.pointfinder.core.designsystem

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

@Composable
private fun PreviewScenarioMatrix(dark: Boolean) {
    val canvas = if (dark) PFColors.SurfaceCanvasDark else PFColors.SurfaceCanvasLight
    val panel = if (dark) PFColors.SurfacePanelDark else PFColors.SurfacePanelLight
    val content = if (dark) PFColors.ContentPrimaryDark else PFColors.ContentPrimaryLight
    val border = if (dark) PFColors.BorderDefaultDark else PFColors.BorderDefaultLight

    Surface(color = canvas, contentColor = content) {
        Column(
            modifier = Modifier.padding(PFSpacingToken.Space4),
            verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2),
        ) {
            Text("PointFinder scenarios", style = MaterialTheme.typography.titleMedium)
            PFPreviewScenario.entries.forEach { scenario ->
                val tone = when (scenario) {
                    PFPreviewScenario.ERROR, PFPreviewScenario.DESTRUCTIVE -> PFColors.StatusRejectedLight
                    PFPreviewScenario.OFFLINE, PFPreviewScenario.QUEUED, PFPreviewScenario.STALE -> PFColors.StatusPendingLight
                    PFPreviewScenario.SELECTED -> PFColors.StatusCheckedInLight
                    else -> border
                }
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = panel,
                    contentColor = content,
                    shape = RoundedCornerShape(PFRadiusToken.Md),
                    border = androidx.compose.foundation.BorderStroke(1.dp, tone),
                ) {
                    Text(
                        text = scenario.name.lowercase().replace('_', ' '),
                        modifier = Modifier.padding(PFSpacingToken.Space3),
                    )
                }
            }
        }
    }
}

@Preview(name = "PointFinder scenarios · light", showBackground = true, widthDp = 390)
@Composable
private fun LightScenarioPreview() = PreviewScenarioMatrix(dark = false)

@Preview(
    name = "PointFinder scenarios · dark",
    showBackground = true,
    widthDp = 390,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun DarkScenarioPreview() = PreviewScenarioMatrix(dark = true)
