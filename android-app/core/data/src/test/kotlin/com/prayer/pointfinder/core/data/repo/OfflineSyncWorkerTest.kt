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

    @Test
    fun `prioritized actions with same timestamp maintains type priority`() {
        val actions = listOf(
            PendingActionEntity("s-1", "submission", "g", "b", "c", "a", 1000, 0),
            PendingActionEntity("c-1", "check_in", "g", "b", null, null, 1000, 0),
            PendingActionEntity("s-2", "submission", "g", "b", "c", "a", 1000, 0),
            PendingActionEntity("c-2", "check_in", "g", "b", null, null, 1000, 0),
        )

        val sorted = prioritizedPendingActions(actions)
        // Check-ins should come before submissions even at the same timestamp
        assertEquals("check_in", sorted[0].type)
        assertEquals("check_in", sorted[1].type)
        assertEquals("submission", sorted[2].type)
        assertEquals("submission", sorted[3].type)
    }

    @Test
    fun `prioritized actions with empty list returns empty`() {
        val sorted = prioritizedPendingActions(emptyList())
        assertEquals(emptyList<PendingActionEntity>(), sorted)
    }

    @Test
    fun `prioritized actions excludes nothing based on retry count`() {
        // prioritizedPendingActions only sorts; filtering by retry limit happens in doWork.
        // Actions with high retry counts are still present after prioritization.
        val actions = listOf(
            PendingActionEntity("over-limit", "submission", "g", "b", "c", "a", 1000, 10),
            PendingActionEntity("normal", "check_in", "g", "b", null, null, 2000, 0),
        )

        val sorted = prioritizedPendingActions(actions)
        assertEquals(2, sorted.size)
        // Check-in still comes first by type priority
        assertEquals("normal", sorted[0].id)
        assertEquals("over-limit", sorted[1].id)
    }
}
