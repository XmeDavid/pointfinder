package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Autocomplete popover shown under the caret when the operator types `{{`
 * inside the rich-text editor, or inside the correctAnswer chip-add field.
 *
 * - Filters [availableKeys] by substring (case-insensitive).
 * - Shows up to 8 matches.
 * - When [partial] is non-empty and not already a known key, appends a
 *   "Create variable {{partial}}" action that delegates to [onCreate].
 */
@Composable
fun VariableAutocompleteOverlay(
    partial: String,
    availableKeys: List<String>,
    onSelect: (String) -> Unit,
    onCreate: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val filtered = availableKeys.filter { it.contains(partial, ignoreCase = true) }.take(8)
    val showsCreate = partial.isNotEmpty() && availableKeys.none { it.equals(partial, ignoreCase = true) }

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .widthIn(min = 220.dp, max = 280.dp),
        tonalElevation = 6.dp,
        shadowElevation = 6.dp,
    ) {
        Column {
            filtered.forEach { key ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(key) }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("variable-suggestion-$key"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "{{$key}}",
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace
                        ),
                    )
                }
            }
            if (showsCreate) {
                if (filtered.isNotEmpty()) HorizontalDivider()
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onCreate(partial) }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("variable-suggestion-create"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Create variable ", fontSize = 13.sp)
                    Text(
                        "{{$partial}}",
                        fontSize = 12.sp,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace
                        ),
                    )
                }
            }
        }
    }
}
