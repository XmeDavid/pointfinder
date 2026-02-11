package com.dbv.companion.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class BaseProgressTest {
    @Test
    fun `maps backend status strings to base status enum`() {
        val statusMap = mapOf(
            "not_visited" to BaseStatus.NOT_VISITED,
            "checked_in" to BaseStatus.CHECKED_IN,
            "submitted" to BaseStatus.SUBMITTED,
            "completed" to BaseStatus.COMPLETED,
            "rejected" to BaseStatus.REJECTED,
            "anything_else" to BaseStatus.NOT_VISITED,
        )

        statusMap.forEach { (raw, expected) ->
            val progress = BaseProgress(
                baseId = "base",
                baseName = "Base",
                lat = 0.0,
                lng = 0.0,
                nfcLinked = false,
                requirePresenceToSubmit = false,
                status = raw,
            )
            assertEquals(expected, progress.baseStatus())
        }
    }
}
