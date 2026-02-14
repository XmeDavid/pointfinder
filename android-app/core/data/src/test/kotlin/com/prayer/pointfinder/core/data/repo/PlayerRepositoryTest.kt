package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.AuthType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class PlayerRepositoryTest {

    @Test
    fun `submit result contains correct fields for offline submission`() {
        val result = SubmitResult(
            response = com.prayer.pointfinder.core.model.SubmissionResponse(
                id = UUID.randomUUID().toString(),
                teamId = UUID.randomUUID().toString(),
                challengeId = UUID.randomUUID().toString(),
                baseId = UUID.randomUUID().toString(),
                answer = "test answer",
                fileUrl = null,
                status = "pending",
                submittedAt = java.time.Instant.now().toString(),
                reviewedBy = null,
                feedback = null,
                completionContent = null,
            ),
            queued = true,
        )
        assertTrue(result.queued)
        assertEquals("pending", result.response.status)
        assertNotNull(result.response.id)
    }

    @Test
    fun `check in result indicates queued state correctly`() {
        val result = CheckInResult(
            response = com.prayer.pointfinder.core.model.CheckInResponse(
                checkInId = UUID.randomUUID().toString(),
                baseId = UUID.randomUUID().toString(),
                baseName = "Test Base",
                checkedInAt = java.time.Instant.now().toString(),
                challenge = null,
            ),
            queued = true,
        )
        assertTrue(result.queued)
        assertEquals("Test Base", result.response.baseName)
    }

    @Test
    fun `progress result carries game status`() {
        val result = ProgressResult(
            progress = emptyList(),
            gameStatus = "live",
        )
        assertEquals("live", result.gameStatus)
        assertTrue(result.progress.isEmpty())
    }
}

