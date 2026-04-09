package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.model.GameTag

/**
 * Horizontal scrollable row of tag filter chips for BasesListScreen and ChallengesListScreen.
 * AND semantics: items must carry ALL selected tags to pass the filter.
 */
@Composable
fun TagFilterRow(
    tags: List<GameTag>,
    selectedTagIds: Set<String>,
    onToggleTag: (String) -> Unit,
    onClearFilters: () -> Unit,
    clearLabel: String,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .testTag("tag-filter-bar"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items(tags, key = { it.id }) { tag ->
            val isSelected = selectedTagIds.contains(tag.id)
            val parsedColor = runCatching {
                Color(android.graphics.Color.parseColor(tag.color))
            }.getOrDefault(Color(0xFF3b82f6))
            val luminance = run {
                val r = (parsedColor.red)
                val g = (parsedColor.green)
                val b = (parsedColor.blue)
                fun lin(c: Float): Float = if (c <= 0.04045f) c / 12.92f else Math.pow(((c + 0.055f) / 1.055f).toDouble(), 2.4).toFloat()
                0.2126f * lin(r) + 0.7152f * lin(g) + 0.0722f * lin(b)
            }
            val chipTextColor = if (isSelected) {
                if (luminance > 0.179f) Color.Black else Color.White
            } else {
                MaterialTheme.colorScheme.onSurface
            }

            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .then(
                        if (isSelected) {
                            Modifier.background(parsedColor)
                        } else {
                            Modifier
                                .background(MaterialTheme.colorScheme.surface)
                                .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                        }
                    )
                    .clickable { onToggleTag(tag.id) }
                    .padding(horizontal = 12.dp, vertical = 6.dp)
                    .testTag("filter-tag-${tag.id}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = tag.label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = chipTextColor,
                )
            }
        }

        if (selectedTagIds.isNotEmpty()) {
            item {
                TextButton(
                    onClick = onClearFilters,
                    modifier = Modifier.testTag("filter-clear"),
                ) {
                    Text(
                        text = clearLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
