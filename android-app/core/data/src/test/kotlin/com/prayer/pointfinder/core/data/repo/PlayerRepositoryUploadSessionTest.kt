package com.prayer.pointfinder.core.data.repo

import com.prayer.pointfinder.core.model.UploadSessionResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlayerRepositoryUploadSessionTest {

    @Test
    fun `completed session with file URL returns URL`() {
        val fileUrl = completedUploadFileUrl(session(status = "completed", fileUrl = "https://files.example/x.jpg"))

        assertEquals("https://files.example/x.jpg", fileUrl)
    }

    @Test
    fun `completed session with blank file URL returns null`() {
        val fileUrl = completedUploadFileUrl(session(status = "completed", fileUrl = "   "))

        assertNull(fileUrl)
    }

    @Test
    fun `non completed session returns null even with file URL`() {
        val fileUrl = completedUploadFileUrl(session(status = "uploading", fileUrl = "https://files.example/x.jpg"))

        assertNull(fileUrl)
    }

    private fun session(status: String, fileUrl: String?): UploadSessionResponse {
        return UploadSessionResponse(
            sessionId = "session-1",
            gameId = "game-1",
            contentType = "image/jpeg",
            totalSizeBytes = 100L,
            chunkSizeBytes = 50,
            totalChunks = 2,
            uploadedChunks = listOf(0, 1),
            status = status,
            fileUrl = fileUrl,
            expiresAt = "2026-01-01T00:00:00Z",
        )
    }
}
