package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.data.local.PendingActionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class OfflineSyncWorkerTest {
    @Test
    fun `prioritized actions run check-ins before submissions`() {
        val actions = listOf(
            PendingActionEntity(
                id = "submission-1",
                type = "submission",
                gameId = "g",
                baseId = "b1",
                challengeId = "c1",
                answer = "ans",
                createdAtEpochMs = 1000,
                retryCount = 0,
            ),
            PendingActionEntity(
                id = "checkin-1",
                type = "check_in",
                gameId = "g",
                baseId = "b2",
                challengeId = null,
                answer = null,
                createdAtEpochMs = 2000,
                retryCount = 0,
            ),
        )

        val sorted = prioritizedPendingActions(actions)
        assertEquals(listOf("checkin-1", "submission-1"), sorted.map { it.id })
    }

    @Test
    fun `prioritized actions keep chronological order within type`() {
        val actions = listOf(
            PendingActionEntity("c-late", "check_in", "g", "b", null, null, 2000, 0),
            PendingActionEntity("c-early", "check_in", "g", "b", null, null, 1000, 0),
            PendingActionEntity("s-late", "submission", "g", "b", "c", "a", 4000, 0),
            PendingActionEntity("s-early", "submission", "g", "b", "c", "a", 3000, 0),
        )

        val sorted = prioritizedPendingActions(actions)
        assertEquals(
            listOf("c-early", "c-late", "s-early", "s-late"),
            sorted.map { it.id },
        )
    }
}
